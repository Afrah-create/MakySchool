"""Primary subjects, themes, class links."""

from __future__ import annotations

import uuid
from typing import Any

import asyncpg

from app.lib.primary_access import fetch_class_level, level_in_range
from app.lib.primary_reports import DEFAULT_STRANDS, DEFAULT_SUBJECTS
from app.lib.teacher_assignments import format_class_name


def serialize_subject(row: asyncpg.Record) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "code": row["code"],
        "subjectType": row["subject_type"],
        "appliesFrom": row["applies_from"],
        "appliesTo": row["applies_to"],
        "religionType": row["religion_type"],
        "maxMark": float(row["max_mark"]),
        "isPleSubject": bool(row["is_ple_subject"]),
        "isActive": bool(row["is_active"]),
        "displayOrder": row["display_order"],
        "schoolSubjectId": str(row["school_subject_id"])
        if row["school_subject_id"]
        else None,
    }


async def _resolve_or_create_catalogue(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    name: str,
) -> uuid.UUID:
    existing = await conn.fetchval(
        """
        SELECT id FROM school_subjects
        WHERE school_id = $1 AND LOWER(name) = LOWER($2)
        LIMIT 1
        """,
        school_id,
        name.strip(),
    )
    if existing:
        return existing
    return await conn.fetchval(
        """
        INSERT INTO school_subjects (school_id, name)
        VALUES ($1, $2)
        RETURNING id
        """,
        school_id,
        name.strip(),
    )


async def _link_catalogue_to_primary_classes(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    school_subject_id: uuid.UUID,
    applies_from: str,
    applies_to: str,
) -> None:
    classes = await conn.fetch(
        """
        SELECT id, level FROM school_classes
        WHERE school_id = $1 AND level = ANY($2::text[])
        """,
        school_id,
        ["P1", "P2", "P3", "P4", "P5", "P6", "P7"],
    )
    for c in classes:
        if not level_in_range(c["level"], applies_from, applies_to):
            continue
        await conn.execute(
            """
            INSERT INTO school_class_subjects (school_id, class_id, subject_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (class_id, subject_id) DO NOTHING
            """,
            school_id,
            c["id"],
            school_subject_id,
        )


async def list_subjects(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    class_level: str | None = None,
    active_only: bool = True,
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT * FROM primary_subjects
        WHERE school_id = $1
          AND ($2::boolean = false OR is_active = true)
        ORDER BY display_order, name
        """,
        school_id,
        active_only,
    )
    items = [serialize_subject(r) for r in rows]
    if class_level:
        items = [
            s
            for s in items
            if level_in_range(class_level, s["appliesFrom"], s["appliesTo"])
        ]
    return items


async def create_subject(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    payload: dict[str, Any],
) -> dict[str, Any]:
    catalogue_id = await _resolve_or_create_catalogue(
        conn, school_id, payload["name"].strip()
    )
    row = await conn.fetchrow(
        """
        INSERT INTO primary_subjects (
          school_id, name, code, subject_type, applies_from, applies_to,
          religion_type, max_mark, is_ple_subject, display_order, school_subject_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING *
        """,
        school_id,
        payload["name"].strip(),
        payload["code"].strip().upper(),
        payload["subject_type"],
        payload.get("applies_from", "P4"),
        payload.get("applies_to", "P7"),
        payload.get("religion_type"),
        payload.get("max_mark", 100),
        payload.get("is_ple_subject", False),
        payload.get("display_order", 100),
        catalogue_id,
    )
    await _link_catalogue_to_primary_classes(
        conn,
        school_id,
        catalogue_id,
        row["applies_from"],
        row["applies_to"],
    )
    return serialize_subject(row)


async def install_default_subjects(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
) -> dict[str, Any]:
    """Seed DEFAULT_SUBJECTS (incl. LIT/NUM) into primary + school_subjects catalogue."""
    created = 0
    linked = 0
    for s in DEFAULT_SUBJECTS:
        catalogue_id = await _resolve_or_create_catalogue(conn, school_id, s["name"])
        row = await conn.fetchrow(
            """
            INSERT INTO primary_subjects (
              school_id, name, code, subject_type, applies_from, applies_to,
              max_mark, is_ple_subject, display_order, school_subject_id
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            ON CONFLICT (school_id, code) DO UPDATE SET
              name = EXCLUDED.name,
              subject_type = EXCLUDED.subject_type,
              applies_from = EXCLUDED.applies_from,
              applies_to = EXCLUDED.applies_to,
              max_mark = EXCLUDED.max_mark,
              is_ple_subject = EXCLUDED.is_ple_subject,
              display_order = EXCLUDED.display_order,
              school_subject_id = COALESCE(primary_subjects.school_subject_id, EXCLUDED.school_subject_id),
              is_active = true
            RETURNING *
            """,
            school_id,
            s["name"],
            s["code"],
            s["subject_type"],
            s["applies_from"],
            s["applies_to"],
            s.get("max_mark", 100),
            s.get("is_ple_subject", False),
            s.get("display_order", 0),
            catalogue_id,
        )
        if row:
            created += 1
            if not row["school_subject_id"]:
                await conn.execute(
                    """
                    UPDATE primary_subjects SET school_subject_id = $3
                    WHERE id = $1 AND school_id = $2
                    """,
                    row["id"],
                    school_id,
                    catalogue_id,
                )
            sid = row["school_subject_id"] or catalogue_id
            before = await conn.fetchval(
                """
                SELECT COUNT(*)::int FROM school_class_subjects
                WHERE school_id = $1 AND subject_id = $2
                """,
                school_id,
                sid,
            )
            await _link_catalogue_to_primary_classes(
                conn,
                school_id,
                sid,
                s["applies_from"],
                s["applies_to"],
            )
            after = await conn.fetchval(
                """
                SELECT COUNT(*)::int FROM school_class_subjects
                WHERE school_id = $1 AND subject_id = $2
                """,
                school_id,
                sid,
            )
            linked += max(0, (after or 0) - (before or 0))

    subjects = await list_subjects(conn, school_id, active_only=False)
    return {
        "created": created,
        "classLinksAdded": linked,
        "subjects": subjects,
    }


async def update_subject(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    subject_id: uuid.UUID,
    payload: dict[str, Any],
) -> dict[str, Any]:
    row = await conn.fetchrow(
        """
        UPDATE primary_subjects SET
          name = COALESCE($3, name),
          subject_type = COALESCE($4, subject_type),
          applies_from = COALESCE($5, applies_from),
          applies_to = COALESCE($6, applies_to),
          religion_type = COALESCE($7, religion_type),
          max_mark = COALESCE($8, max_mark),
          is_ple_subject = COALESCE($9, is_ple_subject),
          display_order = COALESCE($10, display_order),
          is_active = COALESCE($11, is_active)
        WHERE id = $1 AND school_id = $2
        RETURNING *
        """,
        subject_id,
        school_id,
        payload.get("name"),
        payload.get("subject_type"),
        payload.get("applies_from"),
        payload.get("applies_to"),
        payload.get("religion_type"),
        payload.get("max_mark"),
        payload.get("is_ple_subject"),
        payload.get("display_order"),
        payload.get("is_active"),
    )
    if not row:
        raise LookupError("Subject not found.")
    return serialize_subject(row)


async def soft_delete_subject(
    conn: asyncpg.Connection, school_id: uuid.UUID, subject_id: uuid.UUID
) -> None:
    result = await conn.execute(
        """
        UPDATE primary_subjects SET is_active = false
        WHERE id = $1 AND school_id = $2
        """,
        subject_id,
        school_id,
    )
    if result == "UPDATE 0":
        raise LookupError("Subject not found.")


async def link_class_subject(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    class_id: uuid.UUID,
    subject_id: uuid.UUID,
    teacher_id: uuid.UUID | None = None,
    max_mark: float | None = None,
) -> dict[str, Any]:
    level = await fetch_class_level(conn, school_id, class_id)
    subject = await conn.fetchrow(
        """
        SELECT * FROM primary_subjects
        WHERE id = $1 AND school_id = $2 AND is_active = true
        """,
        subject_id,
        school_id,
    )
    if not subject:
        raise LookupError("Subject not found.")
    if not level_in_range(level, subject["applies_from"], subject["applies_to"]):
        raise ValueError(
            f"{subject['name']} applies from {subject['applies_from']}–{subject['applies_to']}. "
            f"It cannot be assigned to {level}."
        )

    row = await conn.fetchrow(
        """
        INSERT INTO primary_class_subjects (
          school_id, class_id, subject_id, teacher_id, max_mark
        )
        VALUES ($1, $2, $3, $4, COALESCE($5, $6))
        ON CONFLICT (class_id, subject_id) DO UPDATE SET
          teacher_id = COALESCE(EXCLUDED.teacher_id, primary_class_subjects.teacher_id),
          max_mark = COALESCE(EXCLUDED.max_mark, primary_class_subjects.max_mark)
        RETURNING *
        """,
        school_id,
        class_id,
        subject_id,
        teacher_id,
        max_mark,
        float(subject["max_mark"]),
    )
    return {
        "id": str(row["id"]),
        "classId": str(row["class_id"]),
        "subjectId": str(row["subject_id"]),
        "teacherId": str(row["teacher_id"]) if row["teacher_id"] else None,
        "maxMark": float(row["max_mark"]),
    }


async def list_themes(
    conn: asyncpg.Connection, school_id: uuid.UUID, *, class_level: str | None = None
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT * FROM primary_themes
        WHERE school_id = $1 AND is_active = true
        ORDER BY display_order, name
        """,
        school_id,
    )
    items = [
        {
            "id": str(r["id"]),
            "name": r["name"],
            "appliesFrom": r["applies_from"],
            "appliesTo": r["applies_to"],
            "displayOrder": r["display_order"],
        }
        for r in rows
    ]
    if class_level:
        items = [
            t
            for t in items
            if level_in_range(class_level, t["appliesFrom"], t["appliesTo"])
        ]
    return items


async def list_class_roster(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    class_id: uuid.UUID,
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT id, full_name, learner_id
        FROM students
        WHERE school_id = $1 AND current_class_id = $2 AND status = 'active'
        ORDER BY full_name
        """,
        school_id,
        class_id,
    )
    return [
        {
            "id": str(r["id"]),
            "fullName": r["full_name"],
            "learnerId": r["learner_id"],
        }
        for r in rows
    ]


async def list_primary_classes(
    conn: asyncpg.Connection, school_id: uuid.UUID
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT id, level, stream
        FROM school_classes
        WHERE school_id = $1
          AND level = ANY($2::text[])
        ORDER BY level, stream
        """,
        school_id,
        ["P1", "P2", "P3", "P4", "P5", "P6", "P7"],
    )
    return [
        {
            "id": str(r["id"]),
            "level": r["level"],
            "stream": r["stream"],
            "name": format_class_name(r["level"], r["stream"]),
        }
        for r in rows
    ]


def strands() -> list[str]:
    return list(DEFAULT_STRANDS)
