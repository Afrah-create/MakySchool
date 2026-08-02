from __future__ import annotations
import uuid
from typing import Any
import asyncpg
from fastapi import HTTPException
from app.lib.olevel_access import fetch_class_level
from . import serialize

async def list_sessions(conn: asyncpg.Connection, school_id: uuid.UUID, *, class_id:uuid.UUID|None=None,term_id:uuid.UUID|None=None,academic_year_id:uuid.UUID|None=None,status:str|None=None) -> list[dict[str,Any]]:
    rows=await conn.fetch("""SELECT es.*,sc.level,sc.stream,t.name term_name,c.name category_name FROM olevel_exam_sessions es JOIN school_classes sc ON sc.id=es.class_id JOIN terms t ON t.id=es.term_id JOIN curriculum_assessment_categories c ON c.id=es.category_id WHERE es.school_id=$1 AND ($2::uuid IS NULL OR es.class_id=$2) AND ($3::uuid IS NULL OR es.term_id=$3) AND ($4::uuid IS NULL OR es.academic_year_id=$4) AND ($5::text IS NULL OR es.status=$5) ORDER BY es.created_at DESC""",school_id,class_id,term_id,academic_year_id,status); return [serialize.session(r) for r in rows]
def _p(payload: dict[str, Any], *keys: str, default: Any = None) -> Any:
    for k in keys:
        if k in payload and payload[k] is not None:
            return payload[k]
    return default


async def create_session(conn:asyncpg.Connection,school_id:uuid.UUID,actor_id:uuid.UUID,payload:dict[str,Any])->dict[str,Any]:
    class_id = uuid.UUID(str(_p(payload, "class_id", "classId")))
    await fetch_class_level(conn, school_id, class_id)
    curriculum_id = uuid.UUID(str(_p(payload, "curriculum_id", "curriculumId")))
    term_id = uuid.UUID(str(_p(payload, "term_id", "termId")))
    academic_year_id = uuid.UUID(str(_p(payload, "academic_year_id", "academicYearId")))
    category_id = uuid.UUID(str(_p(payload, "category_id", "categoryId")))
    r=await conn.fetchrow(
        """
        INSERT INTO olevel_exam_sessions(
          school_id, curriculum_id, class_id, term_id, academic_year_id,
          category_id, title, max_marks, created_by
        )
        SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9
        WHERE EXISTS(SELECT 1 FROM curricula WHERE id=$2 AND school_id=$1)
          AND EXISTS(SELECT 1 FROM curriculum_assessment_categories WHERE id=$6 AND curriculum_id=$2)
        RETURNING *
        """,
        school_id, curriculum_id, class_id, term_id, academic_year_id, category_id,
        str(_p(payload, "title")).strip(),
        _p(payload, "max_marks", "maxMarks", default=100),
        actor_id,
    )
    if not r: raise LookupError("Curriculum or assessment category not found.")
    return serialize.session(r)
async def patch_session(conn:asyncpg.Connection,school_id:uuid.UUID,session_id:uuid.UUID,payload:dict[str,Any])->dict[str,Any]:
    r=await conn.fetchrow(
        """
        UPDATE olevel_exam_sessions
        SET title=COALESCE($3,title), max_marks=COALESCE($4,max_marks), updated_at=NOW()
        WHERE id=$1 AND school_id=$2 AND status='draft'
        RETURNING *
        """,
        session_id, school_id, payload.get("title"),
        _p(payload, "max_marks", "maxMarks"),
    )
    if not r: raise HTTPException(409,detail={"error":"Session not found or is no longer a draft.","code":"SESSION_LOCKED"})
    return serialize.session(r)
async def open_session(conn:asyncpg.Connection,school_id:uuid.UUID,session_id:uuid.UUID)->dict[str,Any]:
    r=await conn.fetchrow("UPDATE olevel_exam_sessions SET status='open',opened_at=NOW(),closed_at=NULL,updated_at=NOW() WHERE id=$1 AND school_id=$2 AND status IN ('draft','closed') RETURNING *",session_id,school_id)
    if not r: raise LookupError("Exam session not found.")
    return serialize.session(r)
async def close_session(conn:asyncpg.Connection,school_id:uuid.UUID,session_id:uuid.UUID)->dict[str,Any]:
    pending=await conn.fetch("""SELECT os.name,u.full_name FROM olevel_mark_submissions ms JOIN olevel_subjects os ON os.id=ms.subject_id JOIN users u ON u.id=ms.teacher_id WHERE ms.school_id=$1 AND ms.exam_session_id=$2 AND ms.status <> 'submitted'""",school_id,session_id)
    if pending: raise HTTPException(409,detail={"error":"All mark submissions must be submitted.","code":"PENDING_SUBMISSIONS","pending":[{"subject":x["name"],"teacher":x["full_name"]} for x in pending]})
    r=await conn.fetchrow("UPDATE olevel_exam_sessions SET status='closed',closed_at=NOW(),updated_at=NOW() WHERE id=$1 AND school_id=$2 RETURNING *",session_id,school_id)
    if not r: raise LookupError("Exam session not found.")
    return serialize.session(r)
