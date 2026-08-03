"""Lower-primary thematic sittings lifecycle (BOT/MID/EOT for P1–P3)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import asyncpg
from fastapi import HTTPException

from app.lib.primary_access import fetch_class_level, is_lower_primary
from app.lib.teacher_assignments import format_class_name
from app.services.primary.exams import ensure_default_exam_types

_UNSET = object()

SITTING_SELECT = """
SELECT
  s.id, s.school_id, s.class_id, s.term_id, s.academic_year_id,
  s.exam_type_id, s.name, s.status, s.notes,
  s.opened_at, s.opened_by, s.closed_at, s.closed_by,
  s.deleted_at, s.deleted_by, s.created_by, s.created_at, s.updated_at,
  sc.level AS class_level, sc.stream AS class_stream,
  t.name AS term_name,
  et.name AS exam_type_name, et.code AS exam_type_code,
  ou.full_name AS opened_by_name,
  cu.full_name AS closed_by_name
FROM primary_thematic_sittings s
JOIN school_classes sc ON sc.id = s.class_id
JOIN terms t ON t.id = s.term_id
LEFT JOIN primary_exam_types et ON et.id = s.exam_type_id
LEFT JOIN users ou ON ou.id = s.opened_by
LEFT JOIN users cu ON cu.id = s.closed_by
"""


def serialize_sitting(row: asyncpg.Record) -> dict[str, Any]:
    class_name = format_class_name(row["class_level"], row["class_stream"])
    deleted = row["deleted_at"] is not None
    return {
        "id": str(row["id"]),
        "schoolId": str(row["school_id"]),
        "classId": str(row["class_id"]),
        "termId": str(row["term_id"]),
        "academicYearId": str(row["academic_year_id"]),
        "examTypeId": str(row["exam_type_id"]) if row["exam_type_id"] else None,
        "examTypeName": row["exam_type_name"],
        "examTypeCode": row["exam_type_code"],
        "name": row["name"],
        "status": row["status"],
        "isOpen": row["status"] == "open",
        "isLocked": row["status"] == "closed",
        "className": class_name,
        "classLevel": row["class_level"],
        "termName": row["term_name"],
        "notes": row["notes"],
        "openedAt": row["opened_at"].isoformat() if row["opened_at"] else None,
        "openedByName": row["opened_by_name"],
        "closedAt": row["closed_at"].isoformat() if row["closed_at"] else None,
        "closedByName": row["closed_by_name"],
        "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
        "deletedAt": row["deleted_at"].isoformat() if row["deleted_at"] else None,
        "deleted": deleted,
    }


async def require_sitting(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    sitting_id: uuid.UUID,
    *,
    include_deleted: bool = False,
) -> dict[str, Any]:
    clause = "" if include_deleted else "AND s.deleted_at IS NULL"
    row = await conn.fetchrow(
        f"{SITTING_SELECT} WHERE s.id = $1 AND s.school_id = $2 {clause}",
        sitting_id,
        school_id,
    )
    if not row:
        raise LookupError("Thematic sitting not found.")
    data = serialize_sitting(row)
    data["hasMarks"] = (
        await sitting_assessment_count(conn, school_id, sitting_id)
    ) > 0
    return data


async def sitting_assessment_count(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    sitting_id: uuid.UUID,
) -> int:
    return int(
        await conn.fetchval(
            """
            SELECT COUNT(*)::int FROM primary_thematic_assessments
            WHERE school_id = $1 AND sitting_id = $2
            """,
            school_id,
            sitting_id,
        )
        or 0
    )


async def assert_sitting_open_for_marks(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    sitting_id: uuid.UUID,
) -> dict[str, Any]:
    sitting = await require_sitting(conn, school_id, sitting_id)
    if sitting["status"] != "open":
        raise PermissionError(
            "This thematic sitting is not open for mark entry. "
            "Ask an admin to open it first."
        )
    return sitting


async def list_sittings(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    class_id: uuid.UUID | None = None,
    term_id: uuid.UUID | None = None,
    status: str | None = None,
    include_deleted: bool = False,
) -> list[dict[str, Any]]:
    clauses = ["s.school_id = $1"]
    args: list[Any] = [school_id]
    if not include_deleted:
        clauses.append("s.deleted_at IS NULL")
    if class_id:
        args.append(class_id)
        clauses.append(f"s.class_id = ${len(args)}")
    if term_id:
        args.append(term_id)
        clauses.append(f"s.term_id = ${len(args)}")
    if status:
        args.append(status)
        clauses.append(f"s.status = ${len(args)}")

    rows = await conn.fetch(
        f"{SITTING_SELECT} WHERE {' AND '.join(clauses)} ORDER BY s.created_at DESC",
        *args,
    )
    if not rows:
        return []

    sitting_ids = [r["id"] for r in rows]
    mark_rows = await conn.fetch(
        """
        SELECT sitting_id, COUNT(*)::int AS mark_count
        FROM primary_thematic_assessments
        WHERE school_id = $1 AND sitting_id = ANY($2::uuid[])
        GROUP BY sitting_id
        """,
        school_id,
        sitting_ids,
    )
    mark_map = {str(r["sitting_id"]): int(r["mark_count"]) for r in mark_rows}
    items = []
    for r in rows:
        item = serialize_sitting(r)
        item["hasMarks"] = mark_map.get(item["id"], 0) > 0
        items.append(item)
    return items


async def create_sitting(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor_id: uuid.UUID,
    *,
    class_id: uuid.UUID,
    term_id: uuid.UUID,
    exam_type_id: uuid.UUID,
    name: str | None = None,
    notes: str | None = None,
    open_now: bool = False,
) -> dict[str, Any]:
    level = await fetch_class_level(conn, school_id, class_id)
    if not is_lower_primary(level):
        if level == "P4":
            flag = await conn.fetchval(
                """
                SELECT allow_thematic_in_p4 FROM primary_grading_systems
                WHERE school_id = $1 AND is_active = true
                """,
                school_id,
            )
            if not flag:
                raise ValueError(
                    "Thematic sittings are for P1–P3 "
                    "(or P4 when thematic assessment is enabled in setup)."
                )
        else:
            raise ValueError(
                "Thematic sittings can only be created for P1–P3 classes."
            )

    await ensure_default_exam_types(conn, school_id)

    term = await conn.fetchrow(
        """
        SELECT id, name, academic_year_id FROM terms
        WHERE id = $1 AND school_id = $2
        """,
        term_id,
        school_id,
    )
    if not term:
        raise LookupError("Term not found.")

    exam_type = await conn.fetchrow(
        """
        SELECT id, name, code FROM primary_exam_types
        WHERE id = $1 AND school_id = $2 AND is_active = true
        """,
        exam_type_id,
        school_id,
    )
    if not exam_type:
        raise LookupError("Exam type not found.")

    class_row = await conn.fetchrow(
        "SELECT level, stream FROM school_classes WHERE id = $1",
        class_id,
    )
    class_name = format_class_name(class_row["level"], class_row["stream"])
    sitting_name = (
        (name or "").strip()
        or f"{exam_type['name']} · {class_name} · {term['name']}"
    )
    status = "open" if open_now else "draft"
    now = datetime.now(timezone.utc) if open_now else None

    try:
        row = await conn.fetchrow(
            """
            INSERT INTO primary_thematic_sittings (
              school_id, class_id, term_id, academic_year_id, exam_type_id,
              name, status, opened_at, opened_by, notes, created_by
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            RETURNING id
            """,
            school_id,
            class_id,
            term_id,
            term["academic_year_id"],
            exam_type_id,
            sitting_name,
            status,
            now,
            actor_id if open_now else None,
            notes,
            actor_id,
        )
    except asyncpg.UniqueViolationError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "error": (
                    "An active sitting of this type already exists for this "
                    "class and term."
                ),
                "code": "DUPLICATE",
            },
        ) from exc

    return await require_sitting(conn, school_id, row["id"])


async def update_sitting(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    sitting_id: uuid.UUID,
    *,
    name: str | None = None,
    notes: Any = _UNSET,
) -> dict[str, Any]:
    sitting = await require_sitting(conn, school_id, sitting_id)
    if sitting.get("deleted"):
        raise ValueError("Cannot edit a deleted sitting. Restore it first.")

    sets: list[str] = ["updated_at = NOW()"]
    args: list[Any] = []
    if name is not None:
        trimmed = name.strip()
        if not trimmed:
            raise ValueError("Sitting name cannot be empty.")
        args.append(trimmed)
        sets.append(f"name = ${len(args)}")
    if notes is not _UNSET:
        args.append(notes)
        sets.append(f"notes = ${len(args)}")

    if args:
        args.extend([sitting_id, school_id])
        await conn.execute(
            f"""
            UPDATE primary_thematic_sittings SET {', '.join(sets)}
            WHERE id = ${len(args) - 1} AND school_id = ${len(args)}
              AND deleted_at IS NULL
            """,
            *args,
        )

    return await require_sitting(conn, school_id, sitting_id)


async def open_sitting(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    sitting_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> dict[str, Any]:
    sitting = await require_sitting(conn, school_id, sitting_id)
    if sitting["status"] == "open":
        return sitting
    await conn.execute(
        """
        UPDATE primary_thematic_sittings SET
          status = 'open',
          opened_at = NOW(),
          opened_by = $3,
          closed_at = NULL,
          closed_by = NULL,
          updated_at = NOW()
        WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL
        """,
        sitting_id,
        school_id,
        actor_id,
    )
    return await require_sitting(conn, school_id, sitting_id)


async def close_sitting(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    sitting_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> dict[str, Any]:
    await require_sitting(conn, school_id, sitting_id)
    await conn.execute(
        """
        UPDATE primary_thematic_sittings SET
          status = 'closed',
          closed_at = NOW(),
          closed_by = $3,
          updated_at = NOW()
        WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL
        """,
        sitting_id,
        school_id,
        actor_id,
    )
    return await require_sitting(conn, school_id, sitting_id)


async def soft_delete_sitting(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    sitting_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> dict[str, Any]:
    sitting = await require_sitting(conn, school_id, sitting_id)
    if sitting["status"] == "open":
        raise HTTPException(
            status_code=409,
            detail={
                "error": "Close the sitting before deleting it.",
                "code": "SITTING_OPEN",
            },
        )
    row = await conn.fetchrow(
        """
        UPDATE primary_thematic_sittings SET
          deleted_at = NOW(),
          deleted_by = $3,
          updated_at = NOW()
        WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL
        RETURNING id
        """,
        sitting_id,
        school_id,
        actor_id,
    )
    if not row:
        raise LookupError("Thematic sitting not found.")
    return await require_sitting(
        conn, school_id, sitting_id, include_deleted=True
    )


async def restore_sitting(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    sitting_id: uuid.UUID,
) -> dict[str, Any]:
    sitting = await require_sitting(
        conn, school_id, sitting_id, include_deleted=True
    )
    if not sitting.get("deleted"):
        raise ValueError("Sitting is not deleted.")

    if sitting.get("examTypeId"):
        conflict = await conn.fetchval(
            """
            SELECT 1 FROM primary_thematic_sittings
            WHERE school_id = $1
              AND class_id = $2
              AND term_id = $3
              AND exam_type_id = $4
              AND deleted_at IS NULL
              AND id <> $5
            LIMIT 1
            """,
            school_id,
            uuid.UUID(sitting["classId"]),
            uuid.UUID(sitting["termId"]),
            uuid.UUID(sitting["examTypeId"]),
            sitting_id,
        )
        if conflict:
            raise HTTPException(
                status_code=409,
                detail={
                    "error": (
                        "An active sitting of this type already exists for this "
                        "class and term. Delete or keep the other sitting before "
                        "restoring."
                    ),
                    "code": "DUPLICATE",
                },
            )

    await conn.execute(
        """
        UPDATE primary_thematic_sittings SET
          deleted_at = NULL,
          deleted_by = NULL,
          updated_at = NOW()
        WHERE id = $1 AND school_id = $2
        """,
        sitting_id,
        school_id,
    )
    return await require_sitting(conn, school_id, sitting_id)


async def hard_delete_sitting(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    sitting_id: uuid.UUID,
) -> None:
    sitting = await require_sitting(
        conn, school_id, sitting_id, include_deleted=True
    )
    if sitting["status"] == "open" and not sitting.get("deleted"):
        raise HTTPException(
            status_code=409,
            detail={
                "error": "Close the sitting before permanently deleting it.",
                "code": "SITTING_OPEN",
            },
        )
    count = await sitting_assessment_count(conn, school_id, sitting_id)
    if count > 0 and not sitting.get("deleted"):
        raise ValueError(
            "This sitting has assessments. Soft-delete it instead, or remove "
            "assessments first."
        )
    result = await conn.execute(
        """
        DELETE FROM primary_thematic_sittings
        WHERE id = $1 AND school_id = $2
        """,
        sitting_id,
        school_id,
    )
    if result == "DELETE 0":
        raise LookupError("Thematic sitting not found.")


async def submit_sitting_assessments(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    sitting_id: uuid.UUID,
) -> dict[str, Any]:
    await require_sitting(conn, school_id, sitting_id)
    result = await conn.execute(
        """
        UPDATE primary_thematic_assessments
        SET submitted = true, submitted_at = NOW(), updated_at = NOW()
        WHERE school_id = $1 AND sitting_id = $2 AND submitted = false
        """,
        school_id,
        sitting_id,
    )
    updated = int(result.split()[-1]) if result else 0
    return {"submitted": updated}


async def unlock_sitting_assessments(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    sitting_id: uuid.UUID,
) -> dict[str, Any]:
    await require_sitting(conn, school_id, sitting_id)
    result = await conn.execute(
        """
        UPDATE primary_thematic_assessments
        SET submitted = false, submitted_at = NULL, updated_at = NOW()
        WHERE school_id = $1 AND sitting_id = $2 AND submitted = true
        """,
        school_id,
        sitting_id,
    )
    updated = int(result.split()[-1]) if result else 0
    return {"unlocked": updated}
