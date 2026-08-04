"""Atomic year-end rollover execution for one track."""

from __future__ import annotations

import json
import uuid
from datetime import date
from typing import Any

import asyncpg

from app.lib.academic_years import TermInputData, upsert_academic_year
from app.lib.promotion_rules import levels_for_track
from app.services.rollover.promotion_preview import (
    PromotionPreviewError,
    build_promotion_preview,
)
from app.services.rollover.previews import (
    build_fee_structure_preview,
    build_teacher_assignment_preview,
    build_timetable_preview,
    map_class_forward,
)


class RolloverExecuteError(Exception):
    def __init__(self, message: str, *, code: str = "VALIDATION_ERROR") -> None:
        super().__init__(message)
        self.message = message
        self.code = code


def _parse_date(value: Any) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


async def _resolve_effective_student_decisions(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    track: str,
    from_year_id: uuid.UUID,
    draft: dict[str, Any],
) -> list[dict[str, Any]]:
    preview = await build_promotion_preview(
        conn,
        school_id,
        track=track,  # type: ignore[arg-type]
        from_academic_year_id=from_year_id,
    )
    overrides = draft.get("studentDecisions") or {}
    effective: list[dict[str, Any]] = []

    for row in preview["students"]:
        student_id = row["studentId"]
        override = overrides.get(student_id) or {}
        action = override.get("action") or row["proposedAction"]
        if action == "manual_next":
            action = "graduate"
        if action not in ("promote", "repeat", "graduate"):
            if action == "no_path":
                raise RolloverExecuteError(
                    f"Student {row['fullName']} has no promotion path. "
                    "Create the target class or override to repeat/graduate.",
                    code="PROMOTION_BLOCKED",
                )
            raise RolloverExecuteError(
                f"Invalid promotion action for {row['fullName']}: {action}",
            )

        target_class_id = override.get("targetClassId") or row["proposedClassId"]
        if action == "promote":
            if not target_class_id:
                raise RolloverExecuteError(
                    f"Student {row['fullName']} is set to promote but has no target class.",
                    code="PROMOTION_BLOCKED",
                )
        elif action == "repeat":
            target_class_id = row["currentClassId"]
        else:
            target_class_id = None

        effective.append(
            {
                "student_id": uuid.UUID(student_id),
                "action": action,
                "current_class_id": uuid.UUID(row["currentClassId"]),
                "target_class_id": uuid.UUID(target_class_id) if target_class_id else None,
                "requires_manual_enrollment": bool(row.get("requiresManualEnrollment")),
            }
        )
    return effective


async def _apply_student_decisions(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    to_year_id: uuid.UUID,
    to_year_number: int,
    actor_id: uuid.UUID,
    decisions: list[dict[str, Any]],
) -> dict[str, int]:
    if not decisions:
        return {"promoted": 0, "repeated": 0, "graduated": 0}

    student_ids = [d["student_id"] for d in decisions]
    await conn.execute(
        """
        UPDATE student_class_history
        SET left_at = NOW(),
            reason = 'Year-end rollover'
        WHERE school_id = $1
          AND left_at IS NULL
          AND student_id = ANY($2::uuid[])
        """,
        school_id,
        student_ids,
    )

    promote_ids = [d["student_id"] for d in decisions if d["action"] == "promote"]
    promote_classes = [d["target_class_id"] for d in decisions if d["action"] == "promote"]
    repeat_ids = [d["student_id"] for d in decisions if d["action"] == "repeat"]
    repeat_classes = [d["target_class_id"] for d in decisions if d["action"] == "repeat"]
    graduate_ids = [d["student_id"] for d in decisions if d["action"] == "graduate"]
    graduate_from = [d["current_class_id"] for d in decisions if d["action"] == "graduate"]

    if promote_ids:
        await conn.execute(
            """
            UPDATE students AS s
            SET current_class_id = v.class_id,
                updated_at = NOW()
            FROM UNNEST($2::uuid[], $3::uuid[]) AS v(student_id, class_id)
            WHERE s.id = v.student_id AND s.school_id = $1
            """,
            school_id,
            promote_ids,
            promote_classes,
        )
        await conn.execute(
            """
            INSERT INTO student_class_history (
              id, school_id, student_id, class_id, academic_year_id,
              enrolled_at, reason, moved_by
            )
            SELECT
              gen_random_uuid(), $1, v.student_id, v.class_id, $2,
              NOW(), 'Promoted (year-end rollover)', $3
            FROM UNNEST($4::uuid[], $5::uuid[]) AS v(student_id, class_id)
            """,
            school_id,
            to_year_id,
            actor_id,
            promote_ids,
            promote_classes,
        )

    if repeat_ids:
        await conn.execute(
            """
            UPDATE students AS s
            SET current_class_id = v.class_id,
                updated_at = NOW()
            FROM UNNEST($2::uuid[], $3::uuid[]) AS v(student_id, class_id)
            WHERE s.id = v.student_id AND s.school_id = $1
            """,
            school_id,
            repeat_ids,
            repeat_classes,
        )
        await conn.execute(
            """
            INSERT INTO student_class_history (
              id, school_id, student_id, class_id, academic_year_id,
              enrolled_at, reason, moved_by
            )
            SELECT
              gen_random_uuid(), $1, v.student_id, v.class_id, $2,
              NOW(), 'Repeated (year-end rollover)', $3
            FROM UNNEST($4::uuid[], $5::uuid[]) AS v(student_id, class_id)
            """,
            school_id,
            to_year_id,
            actor_id,
            repeat_ids,
            repeat_classes,
        )

    if graduate_ids:
        await conn.execute(
            """
            UPDATE students AS s
            SET status = 'graduated',
                current_class_id = NULL,
                graduation_year = $2,
                graduation_class_id = v.class_id,
                graduated_at = NOW(),
                updated_at = NOW()
            FROM UNNEST($3::uuid[], $4::uuid[]) AS v(student_id, class_id)
            WHERE s.id = v.student_id AND s.school_id = $1
            """,
            school_id,
            to_year_number,
            graduate_ids,
            graduate_from,
        )

    return {
        "promoted": len(promote_ids),
        "repeated": len(repeat_ids),
        "graduated": len(graduate_ids),
    }


async def _apply_teacher_assignments(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    track: str,
    from_year_id: uuid.UUID,
    to_year_id: uuid.UUID,
    actor_id: uuid.UUID,
    draft: dict[str, Any],
) -> int:
    preview = await build_teacher_assignment_preview(
        conn,
        school_id,
        track=track,  # type: ignore[arg-type]
        from_academic_year_id=from_year_id,
    )
    selected_ids = draft.get("teacherAssignmentIds")
    if selected_ids is None:
        # Default: include all mappable
        include = {a["assignmentId"] for a in preview["assignments"] if a["mappable"]}
    else:
        include = {str(x) for x in selected_ids}

    to_insert: list[tuple[uuid.UUID, uuid.UUID, uuid.UUID | None]] = []
    for a in preview["assignments"]:
        if a["assignmentId"] not in include:
            continue
        if not a["mappable"] or not a["toClassId"]:
            continue
        to_insert.append(
            (
                uuid.UUID(a["teacherId"]),
                uuid.UUID(a["toClassId"]),
                uuid.UUID(a["subjectId"]) if a["subjectId"] else None,
            )
        )

    if not to_insert:
        return 0

    await conn.executemany(
        """
        INSERT INTO teacher_class_assignments (
          id, school_id, teacher_id, class_id, subject_id,
          academic_year_id, assigned_by, assigned_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW()
        )
        ON CONFLICT (school_id, teacher_id, class_id, subject_id, academic_year_id)
        DO NOTHING
        """,
        [
            (school_id, teacher_id, class_id, subject_id, to_year_id, actor_id)
            for teacher_id, class_id, subject_id in to_insert
        ],
    )
    return len(to_insert)


async def _apply_fee_structures(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    track: str,
    from_year_id: uuid.UUID,
    to_year_id: uuid.UUID,
    to_year_number: int,
    actor_id: uuid.UUID,
    draft: dict[str, Any],
) -> dict[str, int]:
    preview = await build_fee_structure_preview(
        conn,
        school_id,
        track=track,  # type: ignore[arg-type]
        from_academic_year_id=from_year_id,
    )
    selected = draft.get("feeStructureIds")
    if selected is None:
        include = {s["structureId"] for s in preview["structures"]}
    else:
        include = {str(x) for x in selected}

    percent = float(draft.get("feePercentIncrease") or 0)
    multiplier = 1.0 + (percent / 100.0)
    created = 0
    items_created = 0

    for structure in preview["structures"]:
        if structure["structureId"] not in include:
            continue
        old_id = uuid.UUID(structure["structureId"])
        new_amount = int(round(structure["amount"] * multiplier))
        if new_amount < 1:
            new_amount = 1

        exists = await conn.fetchrow(
            """
            SELECT id FROM fee_structures
            WHERE school_id = $1
              AND class_id = $2
              AND term_name = $3
              AND academic_year = $4
              AND deleted_at IS NULL
            LIMIT 1
            """,
            school_id,
            uuid.UUID(structure["classId"]),
            structure["termName"],
            to_year_number,
        )
        if exists:
            continue

        new_row = await conn.fetchrow(
            """
            INSERT INTO fee_structures (
              school_id, class_id, term_name, academic_year, academic_year_id,
              amount, description, created_by
            )
            SELECT
              school_id, class_id, term_name, $3, $4,
              $5, description, $6
            FROM fee_structures
            WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL
            RETURNING id
            """,
            old_id,
            school_id,
            to_year_number,
            to_year_id,
            new_amount,
            actor_id,
        )
        if not new_row:
            continue
        created += 1
        items = await conn.fetch(
            """
            SELECT description, amount, sort_order, account_id, is_optional
            FROM fee_structure_items
            WHERE fee_structure_id = $1
            ORDER BY sort_order NULLS LAST, description
            """,
            old_id,
        )
        if items:
            await conn.executemany(
                """
                INSERT INTO fee_structure_items (
                  id, school_id, fee_structure_id, account_id,
                  description, amount, sort_order, is_optional
                ) VALUES (
                  gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7
                )
                """,
                [
                    (
                        school_id,
                        new_row["id"],
                        it["account_id"],
                        it["description"],
                        max(1, int(round(int(it["amount"]) * multiplier))),
                        int(it["sort_order"] or 0),
                        bool(it["is_optional"]),
                    )
                    for it in items
                ],
            )
            items_created += len(items)

    return {"structures": created, "lineItems": items_created}


async def _apply_timetable(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    track: str,
    from_year_id: uuid.UUID,
    to_year_id: uuid.UUID,
    draft: dict[str, Any],
) -> int:
    tt = draft.get("timetable") or {}
    if tt.get("include") is False:
        return 0

    source_term_raw = tt.get("sourceTermId")
    source_term_id = uuid.UUID(source_term_raw) if source_term_raw else None
    preview = await build_timetable_preview(
        conn,
        school_id,
        track=track,  # type: ignore[arg-type]
        from_academic_year_id=from_year_id,
        source_term_id=source_term_id,
    )
    if not preview["periods"]:
        return 0

    # First term of the new year
    new_term = await conn.fetchrow(
        """
        SELECT id
        FROM terms
        WHERE school_id = $1 AND academic_year_id = $2
        ORDER BY start_date NULLS LAST, name
        LIMIT 1
        """,
        school_id,
        to_year_id,
    )
    if not new_term:
        raise RolloverExecuteError("New academic year has no terms.", code="TERMS_REQUIRED")

    levels = list(levels_for_track(track))  # type: ignore[arg-type]
    class_rows = await conn.fetch(
        """
        SELECT id, level, stream
        FROM school_classes
        WHERE school_id = $1 AND level = ANY($2::text[])
        """,
        school_id,
        levels,
    )
    by_id = {r["id"]: r for r in class_rows}
    by_key = {(r["level"], r["stream"] or ""): r for r in class_rows}

    period_ids = [uuid.UUID(p["periodId"]) for p in preview["periods"] if p["mappable"]]
    if not period_ids:
        return 0

    source_periods = await conn.fetch(
        """
        SELECT
          id, class_id, day_of_week, period_number,
          start_time, end_time, subject_id, teacher_id, track
        FROM timetable_periods
        WHERE school_id = $1 AND id = ANY($2::uuid[])
        """,
        school_id,
        period_ids,
    )

    rows_to_insert: list[tuple] = []
    for sp in source_periods:
        current = by_id.get(sp["class_id"])
        if not current:
            continue
        target = map_class_forward(current, by_key)
        if not target:
            continue
        rows_to_insert.append(
            (
                target["id"],
                sp["day_of_week"],
                sp["period_number"],
                sp["start_time"],
                sp["end_time"],
                sp["subject_id"],
                sp["teacher_id"],
                sp["track"],
            )
        )

    if not rows_to_insert:
        return 0

    await conn.execute(
        """
        INSERT INTO timetable_periods (
          school_id, class_id, term_id, academic_year_id,
          day_of_week, period_number, start_time, end_time,
          subject_id, teacher_id, track
        )
        SELECT
          $1, v.class_id, $2, $3,
          v.day_of_week, v.period_number, v.start_time, v.end_time,
          v.subject_id, v.teacher_id, v.period_track
        FROM UNNEST(
          $4::uuid[], $5::smallint[], $6::smallint[],
          $7::time[], $8::time[], $9::uuid[], $10::uuid[], $11::text[]
        ) AS v(
          class_id, day_of_week, period_number,
          start_time, end_time, subject_id, teacher_id, period_track
        )
        ON CONFLICT (school_id, class_id, academic_year_id, day_of_week, period_number)
        DO NOTHING
        """,
        school_id,
        new_term["id"],
        to_year_id,
        [r[0] for r in rows_to_insert],
        [r[1] for r in rows_to_insert],
        [r[2] for r in rows_to_insert],
        [r[3] for r in rows_to_insert],
        [r[4] for r in rows_to_insert],
        [r[5] for r in rows_to_insert],
        [r[6] for r in rows_to_insert],
        [r[7] for r in rows_to_insert],
    )
    return len(rows_to_insert)


async def execute_rollover(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    session_id: uuid.UUID,
    actor_id: uuid.UUID,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    session = await conn.fetchrow(
        """
        SELECT *
        FROM academic_year_rollover_sessions
        WHERE id = $1 AND school_id = $2
        FOR UPDATE
        """,
        session_id,
        school_id,
    )
    if not session:
        raise RolloverExecuteError("Rollover session not found.", code="NOT_FOUND")

    if session["status"] == "completed":
        log = await conn.fetchrow(
            """
            SELECT counts, to_academic_year_id, summary
            FROM academic_year_rollover_log
            WHERE session_id = $1 AND school_id = $2
            ORDER BY performed_at DESC
            LIMIT 1
            """,
            session_id,
            school_id,
        )
        return {
            "sessionId": str(session_id),
            "status": "completed",
            "toAcademicYearId": str(session["to_academic_year_id"])
            if session["to_academic_year_id"]
            else None,
            "counts": log["counts"] if log else {},
            "summary": log["summary"] if log else "Already completed.",
            "idempotentReplay": True,
        }

    if session["status"] != "in_progress":
        raise RolloverExecuteError(
            f"Session is {session['status']} and cannot be executed.",
            code="SESSION_LOCKED",
        )

    if idempotency_key:
        await conn.execute(
            """
            UPDATE academic_year_rollover_sessions
            SET idempotency_key = $3, updated_at = NOW()
            WHERE id = $1 AND school_id = $2
            """,
            session_id,
            school_id,
            idempotency_key,
        )

    draft = session["draft"]
    if isinstance(draft, str):
        draft = json.loads(draft)
    draft = dict(draft or {})
    track = session["track"]
    from_year_id = session["from_academic_year_id"]

    new_year = draft.get("newYear") or {}
    year_number = int(new_year.get("year") or 0)
    if year_number < 1990:
        raise RolloverExecuteError("Draft is missing a valid new academic year number.")

    terms_raw = new_year.get("terms") or []
    if len(terms_raw) < 1:
        raise RolloverExecuteError("At least one term is required for the new year.")

    terms = [
        TermInputData(
            name=(t.get("name") or "").strip() or f"Term {i + 1}",
            start_date=_parse_date(t.get("startDate") or t.get("start_date")),
            end_date=_parse_date(t.get("endDate") or t.get("end_date")),
        )
        for i, t in enumerate(terms_raw)
    ]

    # Conflict: another track may already have created this calendar year.
    existing_year = await conn.fetchrow(
        """
        SELECT id, year, is_current
        FROM academic_years
        WHERE school_id = $1 AND year = $2
        """,
        school_id,
        year_number,
    )

    try:
        decisions = await _resolve_effective_student_decisions(
            conn,
            school_id,
            track=track,
            from_year_id=from_year_id,
            draft=draft,
        )
    except PromotionPreviewError as exc:
        raise RolloverExecuteError(exc.message, code=exc.code) from exc

    to_year_id = await upsert_academic_year(
        conn,
        school_id,
        year=year_number,
        terms=terms,
        make_current=True,
    )

    student_counts = await _apply_student_decisions(
        conn,
        school_id,
        to_year_id=to_year_id,
        to_year_number=year_number,
        actor_id=actor_id,
        decisions=decisions,
    )
    teacher_count = await _apply_teacher_assignments(
        conn,
        school_id,
        track=track,
        from_year_id=from_year_id,
        to_year_id=to_year_id,
        actor_id=actor_id,
        draft=draft,
    )
    fee_counts = await _apply_fee_structures(
        conn,
        school_id,
        track=track,
        from_year_id=from_year_id,
        to_year_id=to_year_id,
        to_year_number=year_number,
        actor_id=actor_id,
        draft=draft,
    )
    timetable_count = await _apply_timetable(
        conn,
        school_id,
        track=track,
        from_year_id=from_year_id,
        to_year_id=to_year_id,
        draft=draft,
    )

    counts = {
        "studentsPromoted": student_counts["promoted"],
        "studentsRepeated": student_counts["repeated"],
        "studentsGraduated": student_counts["graduated"],
        "teacherAssignments": teacher_count,
        "feeStructures": fee_counts["structures"],
        "feeLineItems": fee_counts["lineItems"],
        "timetablePeriods": timetable_count,
        "reusedExistingYear": bool(existing_year),
    }
    summary = (
        f"{track.title()} rollover to {year_number}: "
        f"{counts['studentsPromoted']} promoted, "
        f"{counts['studentsRepeated']} repeated, "
        f"{counts['studentsGraduated']} graduated; "
        f"{counts['teacherAssignments']} teacher assignments; "
        f"{counts['feeStructures']} fee structures; "
        f"{counts['timetablePeriods']} timetable periods."
    )

    await conn.execute(
        """
        INSERT INTO academic_year_rollover_log (
          school_id, session_id, track,
          from_academic_year_id, to_academic_year_id,
          performed_by, performed_at, counts, summary
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7::jsonb, $8)
        """,
        school_id,
        session_id,
        track,
        from_year_id,
        to_year_id,
        actor_id,
        json.dumps(counts),
        summary,
    )

    await conn.execute(
        """
        UPDATE academic_year_rollover_sessions
        SET status = 'completed',
            to_academic_year_id = $3,
            current_step = 6,
            completed_at = NOW(),
            updated_at = NOW()
        WHERE id = $1 AND school_id = $2
        """,
        session_id,
        school_id,
        to_year_id,
    )

    return {
        "sessionId": str(session_id),
        "status": "completed",
        "track": track,
        "toAcademicYearId": str(to_year_id),
        "toYear": year_number,
        "counts": counts,
        "summary": summary,
        "idempotentReplay": False,
        "postRolloverChecklist": [
            "Review the new timetable in Timetable management.",
            "Generate invoices when the bursar is ready (not created by rollover).",
            *(
                ["Enroll graduating O-Level students into S5/A-Level manually."]
                if track == "secondary"
                else []
            ),
        ],
    }


async def list_rollover_history(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT
          l.id,
          l.track,
          l.from_academic_year_id,
          l.to_academic_year_id,
          l.performed_at,
          l.counts,
          l.summary,
          fy.year AS from_year,
          ty.year AS to_year,
          COALESCE(u.full_name, u.name, u.email) AS performed_by_name
        FROM academic_year_rollover_log l
        JOIN academic_years fy ON fy.id = l.from_academic_year_id
        JOIN academic_years ty ON ty.id = l.to_academic_year_id
        LEFT JOIN users u ON u.id = l.performed_by
        WHERE l.school_id = $1
        ORDER BY l.performed_at DESC
        LIMIT 50
        """,
        school_id,
    )
    return [
        {
            "id": str(r["id"]),
            "track": r["track"],
            "fromAcademicYearId": str(r["from_academic_year_id"]),
            "toAcademicYearId": str(r["to_academic_year_id"]),
            "fromYear": int(r["from_year"]),
            "toYear": int(r["to_year"]),
            "performedAt": r["performed_at"].isoformat() if r["performed_at"] else None,
            "performedByName": r["performed_by_name"],
            "counts": r["counts"] if isinstance(r["counts"], dict) else {},
            "summary": r["summary"],
        }
        for r in rows
    ]
