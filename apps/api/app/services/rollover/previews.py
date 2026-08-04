"""Preview helpers for teacher, fee, and timetable rollover steps."""

from __future__ import annotations

import uuid
from typing import Any

import asyncpg

from app.lib.promotion_rules import RolloverTrack, levels_for_track, map_class_label, next_level
from app.services.rollover.promotion_preview import PromotionPreviewError


async def _classes_for_track(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    track: RolloverTrack,
) -> list[asyncpg.Record]:
    levels = list(levels_for_track(track))
    return await conn.fetch(
        """
        SELECT id, level, stream
        FROM school_classes
        WHERE school_id = $1 AND level = ANY($2::text[])
        """,
        school_id,
        levels,
    )


def _class_maps(
    class_rows: list[asyncpg.Record],
) -> tuple[dict[uuid.UUID, asyncpg.Record], dict[tuple[str, str], asyncpg.Record]]:
    by_id = {r["id"]: r for r in class_rows}
    by_key = {(r["level"], r["stream"] or ""): r for r in class_rows}
    return by_id, by_key


def map_class_forward(
    class_row: asyncpg.Record,
    by_key: dict[tuple[str, str], asyncpg.Record],
) -> asyncpg.Record | None:
    nxt = next_level(class_row["level"])
    if not nxt:
        return None
    return by_key.get((nxt, class_row["stream"] or ""))


async def build_teacher_assignment_preview(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    track: RolloverTrack,
    from_academic_year_id: uuid.UUID,
) -> dict[str, Any]:
    class_rows = await _classes_for_track(conn, school_id, track)
    by_id, by_key = _class_maps(class_rows)
    class_ids = [r["id"] for r in class_rows]
    if not class_ids:
        return {"assignments": [], "summary": {"total": 0, "mappable": 0, "unmapped": 0}}

    rows = await conn.fetch(
        """
        SELECT
          tca.id,
          tca.teacher_id,
          tca.class_id,
          tca.subject_id,
          COALESCE(u.full_name, u.name, u.email) AS teacher_name,
          s.name AS subject_name,
          sc.level,
          sc.stream
        FROM teacher_class_assignments tca
        JOIN users u ON u.id = tca.teacher_id
        JOIN school_classes sc ON sc.id = tca.class_id
        LEFT JOIN school_subjects s ON s.id = tca.subject_id
        WHERE tca.school_id = $1
          AND tca.academic_year_id = $2
          AND tca.class_id = ANY($3::uuid[])
        ORDER BY teacher_name, sc.level, sc.stream, subject_name
        """,
        school_id,
        from_academic_year_id,
        class_ids,
    )

    assignments: list[dict[str, Any]] = []
    mappable = unmapped = 0
    for row in rows:
        current = by_id.get(row["class_id"])
        target = map_class_forward(current, by_key) if current else None
        if target:
            mappable += 1
            target_id = str(target["id"])
            target_label = map_class_label(target["level"], target["stream"])
            reason = f"Map {map_class_label(row['level'], row['stream'])} → {target_label}"
        else:
            unmapped += 1
            target_id = None
            target_label = None
            reason = (
                f"No next class for {map_class_label(row['level'], row['stream'])} "
                "(terminal level or missing stream)."
            )
        assignments.append(
            {
                "assignmentId": str(row["id"]),
                "teacherId": str(row["teacher_id"]),
                "teacherName": row["teacher_name"],
                "subjectId": str(row["subject_id"]) if row["subject_id"] else None,
                "subjectName": row["subject_name"],
                "fromClassId": str(row["class_id"]),
                "fromClassLabel": map_class_label(row["level"], row["stream"]),
                "toClassId": target_id,
                "toClassLabel": target_label,
                "mappable": target is not None,
                "reason": reason,
                "include": target is not None,
            }
        )

    return {
        "assignments": assignments,
        "summary": {
            "total": len(assignments),
            "mappable": mappable,
            "unmapped": unmapped,
        },
    }


async def build_fee_structure_preview(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    track: RolloverTrack,
    from_academic_year_id: uuid.UUID,
) -> dict[str, Any]:
    class_rows = await _classes_for_track(conn, school_id, track)
    class_ids = [r["id"] for r in class_rows]
    if not class_ids:
        return {"structures": [], "summary": {"total": 0, "lineItems": 0}}

    year_row = await conn.fetchrow(
        "SELECT year FROM academic_years WHERE id = $1 AND school_id = $2",
        from_academic_year_id,
        school_id,
    )
    if not year_row:
        raise PromotionPreviewError("Source academic year not found.", code="NOT_FOUND")

    structures = await conn.fetch(
        """
        SELECT
          fs.id,
          fs.class_id,
          fs.term_name,
          fs.academic_year,
          fs.amount,
          fs.description,
          sc.level,
          sc.stream
        FROM fee_structures fs
        JOIN school_classes sc ON sc.id = fs.class_id
        WHERE fs.school_id = $1
          AND fs.deleted_at IS NULL
          AND fs.class_id = ANY($2::uuid[])
          AND (
            fs.academic_year_id = $3
            OR (fs.academic_year_id IS NULL AND fs.academic_year = $4)
          )
        ORDER BY sc.level, sc.stream, fs.term_name
        """,
        school_id,
        class_ids,
        from_academic_year_id,
        int(year_row["year"]),
    )

    out: list[dict[str, Any]] = []
    line_total = 0
    for fs in structures:
        items = await conn.fetch(
            """
            SELECT id, description, amount, sort_order
            FROM fee_structure_items
            WHERE fee_structure_id = $1
            ORDER BY sort_order NULLS LAST, description
            """,
            fs["id"],
        )
        line_total += len(items)
        out.append(
            {
                "structureId": str(fs["id"]),
                "classId": str(fs["class_id"]),
                "classLabel": map_class_label(fs["level"], fs["stream"]),
                "termName": fs["term_name"],
                "amount": int(fs["amount"]),
                "description": fs["description"],
                "include": True,
                "items": [
                    {
                        "itemId": str(it["id"]),
                        "name": it["description"],
                        "amount": int(it["amount"]),
                    }
                    for it in items
                ],
            }
        )

    return {
        "structures": out,
        "summary": {"total": len(out), "lineItems": line_total},
    }


async def build_timetable_preview(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    track: RolloverTrack,
    from_academic_year_id: uuid.UUID,
    source_term_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    class_rows = await _classes_for_track(conn, school_id, track)
    by_id, by_key = _class_maps(class_rows)
    class_ids = [r["id"] for r in class_rows]

    terms = await conn.fetch(
        """
        SELECT id, name, start_date, end_date
        FROM terms
        WHERE school_id = $1 AND academic_year_id = $2
        ORDER BY start_date NULLS LAST, name
        """,
        school_id,
        from_academic_year_id,
    )
    if not terms:
        return {
            "sourceTermId": None,
            "terms": [],
            "periods": [],
            "summary": {"total": 0, "mappable": 0, "unmapped": 0},
        }

    term_id = source_term_id or terms[0]["id"]
    if source_term_id and not any(t["id"] == source_term_id for t in terms):
        raise PromotionPreviewError("Source term is not in the source academic year.")

    periods = await conn.fetch(
        """
        SELECT
          tp.id,
          tp.class_id,
          tp.day_of_week,
          tp.period_number,
          tp.subject_id,
          tp.teacher_id,
          tp.track AS period_track,
          sc.level,
          sc.stream
        FROM timetable_periods tp
        JOIN school_classes sc ON sc.id = tp.class_id
        WHERE tp.school_id = $1
          AND tp.academic_year_id = $2
          AND tp.class_id = ANY($3::uuid[])
          AND ($4::uuid IS NULL OR tp.term_id IS NOT DISTINCT FROM $4::uuid)
        ORDER BY sc.level, sc.stream, tp.day_of_week, tp.period_number
        """,
        school_id,
        from_academic_year_id,
        class_ids,
        term_id,
    )

    out: list[dict[str, Any]] = []
    mappable = unmapped = 0
    for p in periods:
        current = by_id.get(p["class_id"])
        target = map_class_forward(current, by_key) if current else None
        if target:
            mappable += 1
        else:
            unmapped += 1
        out.append(
            {
                "periodId": str(p["id"]),
                "fromClassId": str(p["class_id"]),
                "fromClassLabel": map_class_label(p["level"], p["stream"]),
                "toClassId": str(target["id"]) if target else None,
                "toClassLabel": (
                    map_class_label(target["level"], target["stream"]) if target else None
                ),
                "dayOfWeek": int(p["day_of_week"]),
                "periodNumber": int(p["period_number"]),
                "mappable": target is not None,
            }
        )

    return {
        "sourceTermId": str(term_id),
        "terms": [
            {
                "id": str(t["id"]),
                "name": t["name"],
                "startDate": t["start_date"].isoformat() if t["start_date"] else None,
                "endDate": t["end_date"].isoformat() if t["end_date"] else None,
            }
            for t in terms
        ],
        "periods": out,
        "summary": {
            "total": len(out),
            "mappable": mappable,
            "unmapped": unmapped,
        },
    }
