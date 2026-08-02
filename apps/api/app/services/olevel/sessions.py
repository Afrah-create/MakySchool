from __future__ import annotations

import uuid
from typing import Any

import asyncpg
from fastapi import HTTPException

from app.lib.olevel_access import fetch_class_level

from . import serialize


def _p(payload: dict[str, Any], *keys: str, default: Any = None) -> Any:
    for k in keys:
        if k in payload and payload[k] is not None:
            return payload[k]
    return default


async def get_session(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    session_id: uuid.UUID,
    *,
    include_deleted: bool = False,
) -> dict[str, Any]:
    row = await conn.fetchrow(
        """
        SELECT es.*, sc.level, sc.stream, t.name AS term_name,
               c.name AS category_name, c.code AS category_code,
               c.weight_percent AS category_weight_percent
        FROM olevel_exam_sessions es
        JOIN school_classes sc ON sc.id = es.class_id
        JOIN terms t ON t.id = es.term_id
        JOIN curriculum_assessment_categories c ON c.id = es.category_id
        WHERE es.id = $1 AND es.school_id = $2
          AND ($3::boolean OR es.deleted_at IS NULL)
        """,
        session_id,
        school_id,
        include_deleted,
    )
    if not row:
        raise LookupError("Exam session not found.")
    return serialize.session(row)


async def list_sessions(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    class_id: uuid.UUID | None = None,
    term_id: uuid.UUID | None = None,
    academic_year_id: uuid.UUID | None = None,
    status: str | None = None,
    include_deleted: bool = False,
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT es.*, sc.level, sc.stream, t.name AS term_name,
               c.name AS category_name, c.code AS category_code,
               c.weight_percent AS category_weight_percent,
               EXISTS (
                 SELECT 1 FROM olevel_marks m
                 WHERE m.exam_session_id = es.id
               ) AS has_marks
        FROM olevel_exam_sessions es
        JOIN school_classes sc ON sc.id = es.class_id
        JOIN terms t ON t.id = es.term_id
        JOIN curriculum_assessment_categories c ON c.id = es.category_id
        WHERE es.school_id = $1
          AND ($2::uuid IS NULL OR es.class_id = $2)
          AND ($3::uuid IS NULL OR es.term_id = $3)
          AND ($4::uuid IS NULL OR es.academic_year_id = $4)
          AND ($5::text IS NULL OR es.status = $5)
          AND ($6::boolean OR es.deleted_at IS NULL)
        ORDER BY es.deleted_at NULLS FIRST, es.created_at DESC
        """,
        school_id,
        class_id,
        term_id,
        academic_year_id,
        status,
        include_deleted,
    )
    out = []
    for r in rows:
        item = serialize.session(r)
        item["hasMarks"] = bool(r["has_marks"])
        out.append(item)
    return out


async def create_session(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor_id: uuid.UUID,
    payload: dict[str, Any],
) -> dict[str, Any]:
    class_id = uuid.UUID(str(_p(payload, "class_id", "classId")))
    await fetch_class_level(conn, school_id, class_id)
    curriculum_id = uuid.UUID(str(_p(payload, "curriculum_id", "curriculumId")))
    term_id = uuid.UUID(str(_p(payload, "term_id", "termId")))
    academic_year_id = uuid.UUID(str(_p(payload, "academic_year_id", "academicYearId")))
    category_id = uuid.UUID(str(_p(payload, "category_id", "categoryId")))
    r = await conn.fetchrow(
        """
        INSERT INTO olevel_exam_sessions(
          school_id, curriculum_id, class_id, term_id, academic_year_id,
          category_id, title, max_marks, created_by
        )
        SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9
        WHERE EXISTS(SELECT 1 FROM curricula WHERE id=$2 AND school_id=$1)
          AND EXISTS(
            SELECT 1 FROM curriculum_assessment_categories
            WHERE id=$6 AND curriculum_id=$2
          )
        RETURNING id
        """,
        school_id,
        curriculum_id,
        class_id,
        term_id,
        academic_year_id,
        category_id,
        str(_p(payload, "title")).strip(),
        _p(payload, "max_marks", "maxMarks", default=100),
        actor_id,
    )
    if not r:
        raise LookupError("Curriculum or assessment category not found.")
    return await get_session(conn, school_id, r["id"])


async def patch_session(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    session_id: uuid.UUID,
    payload: dict[str, Any],
) -> dict[str, Any]:
    r = await conn.fetchrow(
        """
        UPDATE olevel_exam_sessions
        SET title = COALESCE($3, title),
            max_marks = COALESCE($4, max_marks),
            updated_at = NOW()
        WHERE id = $1 AND school_id = $2
          AND status = 'draft'
          AND deleted_at IS NULL
        RETURNING id
        """,
        session_id,
        school_id,
        payload.get("title"),
        _p(payload, "max_marks", "maxMarks"),
    )
    if not r:
        raise HTTPException(
            409,
            detail={
                "error": "Session not found, deleted, or is no longer a draft.",
                "code": "SESSION_LOCKED",
            },
        )
    return await get_session(conn, school_id, session_id)


async def open_session(
    conn: asyncpg.Connection, school_id: uuid.UUID, session_id: uuid.UUID
) -> dict[str, Any]:
    r = await conn.fetchrow(
        """
        UPDATE olevel_exam_sessions
        SET status = 'open', opened_at = NOW(), closed_at = NULL, updated_at = NOW()
        WHERE id = $1 AND school_id = $2
          AND status IN ('draft', 'closed')
          AND deleted_at IS NULL
        RETURNING id
        """,
        session_id,
        school_id,
    )
    if not r:
        raise LookupError("Exam session not found or deleted.")
    return await get_session(conn, school_id, session_id)


async def close_session(
    conn: asyncpg.Connection, school_id: uuid.UUID, session_id: uuid.UUID
) -> dict[str, Any]:
    pending = await conn.fetch(
        """
        SELECT os.name, u.full_name
        FROM olevel_mark_submissions ms
        JOIN olevel_subjects os ON os.id = ms.subject_id
        JOIN users u ON u.id = ms.teacher_id
        WHERE ms.school_id = $1 AND ms.exam_session_id = $2 AND ms.status <> 'submitted'
        """,
        school_id,
        session_id,
    )
    if pending:
        raise HTTPException(
            409,
            detail={
                "error": "All mark submissions must be submitted.",
                "code": "PENDING_SUBMISSIONS",
                "pending": [
                    {"subject": x["name"], "teacher": x["full_name"]} for x in pending
                ],
            },
        )
    r = await conn.fetchrow(
        """
        UPDATE olevel_exam_sessions
        SET status = 'closed', closed_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL
        RETURNING id
        """,
        session_id,
        school_id,
    )
    if not r:
        raise LookupError("Exam session not found or deleted.")
    return await get_session(conn, school_id, session_id)


async def session_mark_count(
    conn: asyncpg.Connection, school_id: uuid.UUID, session_id: uuid.UUID
) -> int:
    return int(
        await conn.fetchval(
            """
            SELECT COUNT(*) FROM olevel_marks
            WHERE school_id = $1 AND exam_session_id = $2
            """,
            school_id,
            session_id,
        )
        or 0
    )


async def soft_delete_session(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    session_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> dict[str, Any]:
    session = await get_session(conn, school_id, session_id)
    if session["status"] == "open":
        # Soft-delete bypasses the "all submissions must be submitted" gate used by close.
        await conn.execute(
            """
            UPDATE olevel_exam_sessions
            SET status = 'closed', closed_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND school_id = $2 AND status = 'open' AND deleted_at IS NULL
            """,
            session_id,
            school_id,
        )
    # Soft-deleted sessions must not remain selected for grading.
    await conn.execute(
        """
        UPDATE olevel_term_grading_selections
        SET assessment_session_ids = array_remove(assessment_session_ids, $2::uuid)
        WHERE school_id = $1 AND $2::uuid = ANY (assessment_session_ids)
        """,
        school_id,
        session_id,
    )
    await conn.execute(
        """
        DELETE FROM olevel_term_grading_selections
        WHERE school_id = $1
          AND (
            exam_session_id = $2
            OR cardinality(assessment_session_ids) = 0
          )
        """,
        school_id,
        session_id,
    )
    row = await conn.fetchrow(
        """
        UPDATE olevel_exam_sessions
        SET deleted_at = NOW(), deleted_by = $3, updated_at = NOW()
        WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL
        RETURNING id
        """,
        session_id,
        school_id,
        actor_id,
    )
    if not row:
        raise LookupError("Exam session not found.")
    return await get_session(conn, school_id, session_id, include_deleted=True)


async def restore_session(
    conn: asyncpg.Connection, school_id: uuid.UUID, session_id: uuid.UUID
) -> dict[str, Any]:
    session = await get_session(conn, school_id, session_id, include_deleted=True)
    if not session.get("deleted"):
        raise HTTPException(
            409,
            detail={"error": "Exam session is not deleted.", "code": "NOT_DELETED"},
        )
    await conn.execute(
        """
        UPDATE olevel_exam_sessions
        SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
        WHERE id = $1 AND school_id = $2
        """,
        session_id,
        school_id,
    )
    return await get_session(conn, school_id, session_id)


async def hard_delete_session(
    conn: asyncpg.Connection, school_id: uuid.UUID, session_id: uuid.UUID
) -> None:
    session = await get_session(conn, school_id, session_id, include_deleted=True)
    if session["status"] == "open" and not session.get("deleted"):
        raise HTTPException(
            409,
            detail={
                "error": "Close the exam session before permanently deleting it.",
                "code": "SESSION_OPEN",
            },
        )
    marks = await session_mark_count(conn, school_id, session_id)
    if marks > 0:
        raise HTTPException(
            409,
            detail={
                "error": "This session has marks. Soft-delete it instead to keep the record.",
                "code": "SESSION_HAS_MARKS",
            },
        )
    await conn.execute(
        """
        UPDATE olevel_term_grading_selections
        SET assessment_session_ids = array_remove(assessment_session_ids, $2::uuid)
        WHERE school_id = $1 AND $2::uuid = ANY (assessment_session_ids)
        """,
        school_id,
        session_id,
    )
    await conn.execute(
        """
        DELETE FROM olevel_term_grading_selections
        WHERE school_id = $1
          AND (
            exam_session_id = $2
            OR cardinality(assessment_session_ids) = 0
          )
        """,
        school_id,
        session_id,
    )
    result = await conn.execute(
        "DELETE FROM olevel_exam_sessions WHERE id = $1 AND school_id = $2",
        session_id,
        school_id,
    )
    if result == "DELETE 0":
        raise LookupError("Exam session not found.")
