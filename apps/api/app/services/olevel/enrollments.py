from __future__ import annotations
import uuid
from typing import Any
import asyncpg
from fastapi import HTTPException
from app.lib.olevel_access import fetch_class_level
from . import serialize

async def list_enrollments(conn:asyncpg.Connection,school_id:uuid.UUID,*,class_id:uuid.UUID|None=None,academic_year_id:uuid.UUID|None=None)->list[dict[str,Any]]:
 r=await conn.fetch("""SELECT e.*,s.full_name student_name,s.learner_id,concat(sc.level,COALESCE(sc.stream,'')) class_name FROM student_curriculum_enrollments e JOIN students s ON s.id=e.student_id LEFT JOIN school_classes sc ON sc.id=e.class_id WHERE e.school_id=$1 AND ($2::uuid IS NULL OR e.class_id=$2) AND ($3::uuid IS NULL OR e.academic_year_id=$3) ORDER BY s.full_name""",school_id,class_id,academic_year_id);return [serialize.enrollment(x) for x in r]
async def create_enrollment(conn:asyncpg.Connection,school_id:uuid.UUID,actor_id:uuid.UUID,payload:dict[str,Any])->dict[str,Any]:
 r=await conn.fetchrow("""INSERT INTO student_curriculum_enrollments(school_id,student_id,curriculum_id,class_id,academic_year_id,enrolled_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(student_id,academic_year_id) DO UPDATE SET class_id=EXCLUDED.class_id,curriculum_id=EXCLUDED.curriculum_id RETURNING *""",school_id,uuid.UUID(str(payload["student_id"])),uuid.UUID(str(payload["curriculum_id"])),uuid.UUID(str(payload["class_id"])),uuid.UUID(str(payload["academic_year_id"])),actor_id);return serialize.enrollment(r)
async def bulk_enroll(conn:asyncpg.Connection,school_id:uuid.UUID,actor_id:uuid.UUID,*,class_id:uuid.UUID,academic_year_id:uuid.UUID,curriculum_id:uuid.UUID)->dict[str,Any]:
 await fetch_class_level(conn,school_id,class_id)
 before=await conn.fetchval("SELECT COUNT(*) FROM student_curriculum_enrollments WHERE school_id=$1 AND class_id=$2 AND academic_year_id=$3",school_id,class_id,academic_year_id)
 r=await conn.fetch("""INSERT INTO student_curriculum_enrollments(school_id,student_id,curriculum_id,class_id,academic_year_id,enrolled_by) SELECT $1,x.id,$2,$3,$4,$5 FROM UNNEST(ARRAY(SELECT id FROM students WHERE school_id=$1 AND current_class_id=$3 AND status='active')) x(id) ON CONFLICT(student_id,academic_year_id) DO NOTHING RETURNING id""",school_id,curriculum_id,class_id,academic_year_id,actor_id); return {"enrolled":len(r),"skipped":max(0,int(before or 0))}
def _norm_subjects(subjects: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for x in subjects:
        out.append(
            {
                "subject_id": str(x.get("subject_id") or x.get("subjectId")),
                "subject_role": x.get("subject_role") or x.get("subjectRole"),
            }
        )
    return out


async def _validate(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    enrollment_id: uuid.UUID,
    subjects: list[dict[str, Any]],
) -> tuple[Any, uuid.UUID]:
    e = await conn.fetchrow(
        "SELECT * FROM student_curriculum_enrollments WHERE id=$1 AND school_id=$2",
        enrollment_id,
        school_id,
    )
    if not e:
        raise LookupError("Enrollment not found.")
    level = await fetch_class_level(conn, school_id, e["class_id"])
    rule = await conn.fetchrow(
        "SELECT * FROM curriculum_selection_rules WHERE curriculum_id=$1 AND $2=ANY(applies_to_levels)",
        e["curriculum_id"],
        level,
    )
    if not rule:
        raise HTTPException(
            422,
            detail={
                "error": "No subject selection rule applies to this class.",
                "code": "MISSING_SELECTION_RULE",
            },
        )
    subjects = _norm_subjects(subjects)
    comp = sum(x["subject_role"] == "compulsory" for x in subjects)
    opt = sum(x["subject_role"] == "optional" for x in subjects)
    if comp != rule["compulsory_count"] or not (
        rule["optional_min"] <= opt <= rule["optional_max"]
    ):
        raise HTTPException(
            422,
            detail={
                "error": (
                    f"Require {rule['compulsory_count']} compulsory and "
                    f"{rule['optional_min']}–{rule['optional_max']} optional subjects."
                ),
                "code": "INVALID_SUBJECT_SELECTION",
            },
        )
    allowed = await conn.fetchval(
        """
        SELECT COUNT(*) FROM curriculum_subjects
        WHERE curriculum_id=$1 AND subject_id=ANY($2::uuid[]) AND is_active
        """,
        e["curriculum_id"],
        [uuid.UUID(str(x["subject_id"])) for x in subjects],
    )
    if allowed != len(subjects):
        raise HTTPException(
            422,
            detail={
                "error": "All subjects must be assigned to this curriculum.",
                "code": "SUBJECT_NOT_IN_CURRICULUM",
            },
        )
    return e, e["academic_year_id"]


async def register_subjects(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor_id: uuid.UUID,
    enrollment_id: uuid.UUID,
    subjects: list[dict[str, Any]],
) -> dict[str, Any]:
    subjects = _norm_subjects(subjects)
    e, year = await _validate(conn, school_id, enrollment_id, subjects)
    ids = [uuid.UUID(str(x["subject_id"])) for x in subjects]
    await conn.execute(
        """
        UPDATE student_subject_registrations
        SET status='dropped'
        WHERE enrollment_id=$1 AND subject_id <> ALL($2::uuid[])
        """,
        enrollment_id,
        ids,
    )
    await conn.execute(
        """
        INSERT INTO student_subject_registrations(
          school_id, enrollment_id, subject_id, subject_role, academic_year_id, registered_by
        )
        SELECT $1, $2, x.id, x.role, $3, $4
        FROM UNNEST($5::uuid[], $6::text[]) x(id, role)
        ON CONFLICT (enrollment_id, subject_id) DO UPDATE SET
          subject_role = EXCLUDED.subject_role,
          status = 'active'
        """,
        school_id,
        enrollment_id,
        year,
        actor_id,
        ids,
        [x["subject_role"] for x in subjects],
    )
    return {"registered": len(ids)}
async def list_subject_registrations(conn:asyncpg.Connection,school_id:uuid.UUID,enrollment_id:uuid.UUID)->list[dict[str,Any]]:
 r=await conn.fetch("SELECT r.*,os.name subject_name,os.code subject_code FROM student_subject_registrations r JOIN olevel_subjects os ON os.id=r.subject_id WHERE r.school_id=$1 AND r.enrollment_id=$2 ORDER BY os.name",school_id,enrollment_id);return [serialize.row(x,{"subject_id":"subjectId","subject_role":"subjectRole","academic_year_id":"academicYearId","subject_name":"subjectName","subject_code":"subjectCode"}) for x in r]
async def bulk_register_subjects(conn:asyncpg.Connection,school_id:uuid.UUID,actor_id:uuid.UUID,*,class_id:uuid.UUID,academic_year_id:uuid.UUID,subjects:list[dict[str,Any]])->dict[str,Any]:
 enrollments=await conn.fetch("SELECT id FROM student_curriculum_enrollments WHERE school_id=$1 AND class_id=$2 AND academic_year_id=$3",school_id,class_id,academic_year_id); saved=0
 for e in enrollments: await register_subjects(conn,school_id,actor_id,e["id"],subjects);saved+=1
 return {"enrolled":saved,"alreadyRegistered":0}
async def drop_subject(conn:asyncpg.Connection,school_id:uuid.UUID,enrollment_id:uuid.UUID,subject_id:uuid.UUID)->None:
 if await conn.fetchval("SELECT 1 FROM olevel_marks WHERE enrollment_id=$1 AND subject_id=$2",enrollment_id,subject_id):raise HTTPException(409,detail={"error":"Cannot drop a subject with marks.","code":"SUBJECT_HAS_MARKS"})
 await conn.execute("UPDATE student_subject_registrations SET status='dropped' WHERE school_id=$1 AND enrollment_id=$2 AND subject_id=$3",school_id,enrollment_id,subject_id)
