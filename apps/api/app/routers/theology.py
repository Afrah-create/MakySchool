from __future__ import annotations

import uuid
from typing import Annotated, Any, Optional

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, field_validator

from app.db.pool import get_db
from app.lib.teacher_assignments import format_class_name, get_current_term_id
from app.middleware.theology_guard import require_theology_enabled

router = APIRouter()

TenantCtx = Annotated[
    tuple[uuid.UUID, dict[str, Any]],
    Depends(require_theology_enabled),
]

ALLOWED_ROLES = {"teacher", "admin", "head_teacher"}
ADMIN_ROLES = {"admin", "head_teacher"}
RATING_VALUES = frozenset({"EE", "ME", "AE", "BE"})
RATING_FIELDS = ("quranic_recitation", "islamic_values", "arabic_literacy", "moral_character")


class RateBody(BaseModel):
    student_id: uuid.UUID
    subject_id: uuid.UUID
    term_id: uuid.UUID
    class_id: uuid.UUID | None = None
    quranic_recitation: str | None = None
    islamic_values: str | None = None
    arabic_literacy: str | None = None
    moral_character: str | None = None

    @field_validator(*RATING_FIELDS)
    @classmethod
    def rating_ok(cls, v: str | None) -> str | None:
        if v is not None and v not in RATING_VALUES:
            raise ValueError("rating must be one of EE, ME, AE, BE")
        return v


def _require_allowed(actor: dict[str, Any]) -> None:
    if actor["role"] not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "You do not have permission to access theology records.", "code": "FORBIDDEN"},
        )


def _actor_id(actor: dict[str, Any]) -> uuid.UUID:
    return uuid.UUID(str(actor.get("user_db_id") or actor["sub"]))


def _serialize(row: asyncpg.Record) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "studentId": str(row["student_id"]),
        "studentName": row["student_name"],
        "subjectId": str(row["subject_id"]),
        "subjectName": row["subject_name"],
        "classId": str(row["class_id"]) if row["class_id"] else None,
        "className": format_class_name(row["level"], row["stream"]) if row.get("level") else None,
        "termId": str(row["term_id"]),
        "quranicRecitation": row["quranic_recitation"],
        "islamicValues": row["islamic_values"],
        "arabicLiteracy": row["arabic_literacy"],
        "moralCharacter": row["moral_character"],
        "teacherId": str(row["teacher_id"]),
        "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
    }


RATING_SELECT = """
    SELECT
      t.id, t.student_id, s.full_name AS student_name,
      t.subject_id, sub.name AS subject_name,
      t.class_id, sc.level, sc.stream,
      t.term_id, t.teacher_id,
      t.quranic_recitation, t.islamic_values, t.arabic_literacy, t.moral_character,
      t.updated_at
    FROM theology_competencies t
    JOIN students s ON s.id = t.student_id
    JOIN school_subjects sub ON sub.id = t.subject_id
    LEFT JOIN school_classes sc ON sc.id = t.class_id
"""


async def _assert_teacher_can_rate(
    conn: asyncpg.Connection, actor: dict[str, Any], school_id: uuid.UUID, class_id: uuid.UUID | None,
) -> None:
    if actor["role"] in ADMIN_ROLES or not class_id:
        return
    actor_id = _actor_id(actor)
    allowed = await conn.fetchval(
        """
        SELECT EXISTS(
          SELECT 1 FROM teacher_class_assignments
          WHERE school_id = $1 AND teacher_id = $2 AND class_id = $3
        )
        OR EXISTS(
          SELECT 1 FROM timetable_periods
          WHERE school_id = $1 AND teacher_id = $2 AND class_id = $3
        )
        """,
        school_id, actor_id, class_id,
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "You do not teach this class.", "code": "FORBIDDEN"},
        )


@router.put("/ratings")
async def upsert_rating(
    body: RateBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    _require_allowed(actor)
    await _assert_teacher_can_rate(conn, actor, school_id, body.class_id)
    actor_id = _actor_id(actor)

    row_id = await conn.fetchval(
        """
        INSERT INTO theology_competencies
          (school_id, student_id, subject_id, class_id, teacher_id, term_id,
           quranic_recitation, islamic_values, arabic_literacy, moral_character)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (student_id, subject_id, term_id)
        DO UPDATE SET
          class_id = EXCLUDED.class_id,
          teacher_id = EXCLUDED.teacher_id,
          quranic_recitation = COALESCE(EXCLUDED.quranic_recitation, theology_competencies.quranic_recitation),
          islamic_values = COALESCE(EXCLUDED.islamic_values, theology_competencies.islamic_values),
          arabic_literacy = COALESCE(EXCLUDED.arabic_literacy, theology_competencies.arabic_literacy),
          moral_character = COALESCE(EXCLUDED.moral_character, theology_competencies.moral_character),
          updated_at = NOW()
        RETURNING id
        """,
        school_id, body.student_id, body.subject_id, body.class_id, actor_id, body.term_id,
        body.quranic_recitation, body.islamic_values, body.arabic_literacy, body.moral_character,
    )
    row = await conn.fetchrow(f"{RATING_SELECT} WHERE t.id = $1", row_id)
    return {"data": _serialize(row)}


@router.get("/class/{class_id}")
async def list_class_ratings(
    class_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    subject_id: Optional[uuid.UUID] = Query(None),
    term_id: Optional[uuid.UUID] = Query(None),
):
    school_id, actor = ctx
    _require_allowed(actor)
    await _assert_teacher_can_rate(conn, actor, school_id, class_id)

    resolved_term = term_id or await get_current_term_id(conn, school_id)
    conditions = ["t.school_id = $1", "t.class_id = $2"]
    params: list[Any] = [school_id, class_id]
    if resolved_term:
        conditions.append(f"t.term_id = ${len(params) + 1}")
        params.append(resolved_term)
    if subject_id:
        conditions.append(f"t.subject_id = ${len(params) + 1}")
        params.append(subject_id)

    rows = await conn.fetch(
        f"{RATING_SELECT} WHERE {' AND '.join(conditions)} ORDER BY s.full_name",
        *params,
    )
    return {"data": [_serialize(r) for r in rows]}


@router.get("/student/{student_id}")
async def student_ratings(
    student_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    term_id: Optional[uuid.UUID] = Query(None),
):
    school_id, actor = ctx
    _require_allowed(actor)

    conditions = ["t.school_id = $1", "t.student_id = $2"]
    params: list[Any] = [school_id, student_id]
    if term_id:
        conditions.append("t.term_id = $3")
        params.append(term_id)

    rows = await conn.fetch(
        f"{RATING_SELECT} WHERE {' AND '.join(conditions)} ORDER BY sub.name",
        *params,
    )
    return {"data": [_serialize(r) for r in rows]}