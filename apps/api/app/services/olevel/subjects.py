from __future__ import annotations
import uuid
from typing import Any
import asyncpg
from fastapi import HTTPException
from . import serialize

async def list_subjects(conn: asyncpg.Connection, school_id: uuid.UUID, *, is_active: bool|None=None, department: str|None=None) -> list[dict[str,Any]]:
    rows=await conn.fetch("SELECT * FROM olevel_subjects WHERE school_id=$1 AND ($2::boolean IS NULL OR is_active=$2) AND ($3::text IS NULL OR department=$3) ORDER BY name",school_id,is_active,department); return [serialize.subject(r) for r in rows]
async def create_subject(conn: asyncpg.Connection, school_id: uuid.UUID, payload: dict[str,Any]) -> dict[str,Any]:
    name=payload["name"].strip(); ss=await conn.fetchval("SELECT id FROM school_subjects WHERE school_id=$1 AND LOWER(name)=LOWER($2)",school_id,name)
    if not ss: ss=await conn.fetchval("INSERT INTO school_subjects(school_id,name) VALUES($1,$2) RETURNING id",school_id,name)
    r=await conn.fetchrow("INSERT INTO olevel_subjects(school_id,school_subject_id,name,code,abbreviation,department) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",school_id,ss,name,payload["code"].strip().upper(),payload.get("abbreviation"),payload.get("department")); return serialize.subject(r)
async def patch_subject(conn: asyncpg.Connection, school_id: uuid.UUID, subject_id: uuid.UUID, payload: dict[str,Any]) -> dict[str,Any]:
    if "code" in payload and await conn.fetchval("SELECT 1 FROM olevel_marks WHERE school_id=$1 AND subject_id=$2",school_id,subject_id): raise HTTPException(409,detail={"error":"Cannot change a subject code after marks exist.","code":"SUBJECT_HAS_MARKS"})
    r=await conn.fetchrow("UPDATE olevel_subjects SET name=COALESCE($3,name),code=COALESCE($4,code),abbreviation=COALESCE($5,abbreviation),department=COALESCE($6,department),is_active=COALESCE($7,is_active),updated_at=NOW() WHERE id=$1 AND school_id=$2 RETURNING *",subject_id,school_id,payload.get("name"),payload.get("code"),payload.get("abbreviation"),payload.get("department"),payload.get("is_active"))
    if not r: raise LookupError("Subject not found.")
    return serialize.subject(r)
async def list_curriculum_subjects(conn: asyncpg.Connection, school_id: uuid.UUID, curriculum_id: uuid.UUID) -> list[dict[str,Any]]:
    rows=await conn.fetch("SELECT cs.*,os.name,os.code,os.abbreviation,os.department,os.school_subject_id FROM curriculum_subjects cs JOIN olevel_subjects os ON os.id=cs.subject_id JOIN curricula c ON c.id=cs.curriculum_id WHERE cs.curriculum_id=$1 AND c.school_id=$2 ORDER BY cs.display_order,os.name",curriculum_id,school_id); return [serialize.curriculum_subject(r) for r in rows]
async def assign_curriculum_subject(conn: asyncpg.Connection, school_id: uuid.UUID, curriculum_id: uuid.UUID, payload: dict[str,Any]) -> dict[str,Any]:
    subject_id = uuid.UUID(str(payload.get("subject_id") or payload.get("subjectId")))
    role = payload.get("subject_role") or payload.get("subjectRole")
    levels = payload.get("applies_to_levels") or payload.get("appliesToLevels")
    order = payload.get("display_order", payload.get("displayOrder", 0))
    r=await conn.fetchrow(
        """
        INSERT INTO curriculum_subjects(curriculum_id,subject_id,subject_role,applies_to_levels,display_order)
        SELECT $1,$2,$3,$4,$5
        WHERE EXISTS(SELECT 1 FROM curricula WHERE id=$1 AND school_id=$6)
        RETURNING *
        """,
        curriculum_id, subject_id, role, levels, order, school_id,
    )
    if not r: raise LookupError("Curriculum or subject not found.")
    os_row = await conn.fetchrow(
        """
        SELECT cs.*, os.name, os.code, os.abbreviation, os.department, os.school_subject_id
        FROM curriculum_subjects cs
        JOIN olevel_subjects os ON os.id = cs.subject_id
        WHERE cs.id = $1
        """,
        r["id"],
    )
    return serialize.curriculum_subject(os_row)
async def update_curriculum_subject(conn: asyncpg.Connection, school_id: uuid.UUID, curriculum_id: uuid.UUID, subject_id: uuid.UUID, payload: dict[str,Any]) -> dict[str,Any]:
    r=await conn.fetchrow(
        """
        UPDATE curriculum_subjects cs
        SET subject_role=COALESCE($4,subject_role),
            applies_to_levels=COALESCE($5,applies_to_levels),
            display_order=COALESCE($6,display_order),
            is_active=COALESCE($7,is_active)
        FROM curricula c
        WHERE cs.curriculum_id=$1 AND cs.subject_id=$2 AND c.id=cs.curriculum_id AND c.school_id=$3
        RETURNING cs.*
        """,
        curriculum_id, subject_id, school_id,
        payload.get("subject_role", payload.get("subjectRole")),
        payload.get("applies_to_levels", payload.get("appliesToLevels")),
        payload.get("display_order", payload.get("displayOrder")),
        payload.get("is_active", payload.get("isActive")),
    )
    if not r: raise LookupError("Curriculum subject not found.")
    os_row = await conn.fetchrow(
        """
        SELECT cs.*, os.name, os.code, os.abbreviation, os.department, os.school_subject_id
        FROM curriculum_subjects cs
        JOIN olevel_subjects os ON os.id = cs.subject_id
        WHERE cs.id = $1
        """,
        r["id"],
    )
    return serialize.curriculum_subject(os_row)
async def remove_curriculum_subject(conn: asyncpg.Connection, school_id: uuid.UUID, curriculum_id: uuid.UUID, subject_id: uuid.UUID) -> None:
    if await conn.fetchval("SELECT 1 FROM student_subject_registrations r JOIN student_curriculum_enrollments e ON e.id=r.enrollment_id WHERE e.curriculum_id=$1 AND r.subject_id=$2",curriculum_id,subject_id): raise HTTPException(409,detail={"error":"Students have registered this subject.","code":"SUBJECT_REGISTERED"})
    await conn.execute("DELETE FROM curriculum_subjects WHERE curriculum_id=$1 AND subject_id=$2",curriculum_id,subject_id)
