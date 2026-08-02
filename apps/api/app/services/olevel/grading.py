from __future__ import annotations
import json, uuid
from typing import Any
import asyncpg
from app.lib import grading_engine

async def load_rules(conn:asyncpg.Connection,school_id:uuid.UUID,curriculum_id:uuid.UUID,level:str)->dict[str,Any]:
 return {"assessment_categories":[dict(x) for x in await conn.fetch("SELECT * FROM curriculum_assessment_categories WHERE curriculum_id=$1 AND is_active",curriculum_id)],"grade_scale":[dict(x) for x in await conn.fetch("SELECT * FROM curriculum_grade_scales WHERE curriculum_id=$1",curriculum_id)],"selection_rules":dict(await conn.fetchrow("SELECT * FROM curriculum_selection_rules WHERE curriculum_id=$1 AND $2=ANY(applies_to_levels)",curriculum_id,level) or {}),"promotion_rules":dict(await conn.fetchrow("SELECT * FROM curriculum_promotion_rules WHERE curriculum_id=$1",curriculum_id) or {})}
async def build_enrollment_data(conn:asyncpg.Connection,school_id:uuid.UUID,enrollment_id:uuid.UUID,term_id:uuid.UUID,academic_year_id:uuid.UUID)->dict[str,Any]:
 e=await conn.fetchrow("""SELECT e.*,sc.level FROM student_curriculum_enrollments e JOIN school_classes sc ON sc.id=e.class_id WHERE e.id=$1 AND e.school_id=$2""",enrollment_id,school_id)
 if not e: raise LookupError("Enrollment not found.")
 rows=await conn.fetch("""SELECT r.subject_id,r.subject_role,os.name,os.code,c.code category_code,m.raw_score,es.max_marks FROM student_subject_registrations r JOIN olevel_subjects os ON os.id=r.subject_id LEFT JOIN olevel_exam_sessions es ON es.class_id=$3 AND es.term_id=$4 AND es.academic_year_id=$5 LEFT JOIN curriculum_assessment_categories c ON c.id=es.category_id LEFT JOIN olevel_marks m ON m.exam_session_id=es.id AND m.student_id=$6 AND m.subject_id=r.subject_id WHERE r.enrollment_id=$1 AND r.status='active'""",enrollment_id,school_id,e["class_id"],term_id,academic_year_id,e["student_id"])
 by:dict[Any,dict[str,Any]]={}
 for x in rows:
  d=by.setdefault(x["subject_id"],{"subject_id":str(x["subject_id"]),"subject_role":x["subject_role"],"subject_name":x["name"],"subject_code":x["code"],"category_scores_raw":{},"max_marks_by_category":{}})
  if x["category_code"]: d["category_scores_raw"][x["category_code"]]=x["raw_score"];d["max_marks_by_category"][x["category_code"]]=x["max_marks"]
 return {"enrollment_id":str(e["id"]),"student_id":str(e["student_id"]),"class_level":e["level"],"curriculum_id":e["curriculum_id"],"subjects":list(by.values())}
async def persist_result(conn:asyncpg.Connection,school_id:uuid.UUID,data:dict[str,Any],result:dict[str,Any],term_id:uuid.UUID,academic_year_id:uuid.UUID)->None:
 subjects=result["subjects"]
 await conn.execute("""INSERT INTO olevel_subject_results(school_id,enrollment_id,subject_id,subject_role,academic_year_id,term_id,category_scores,weighted_score,grade,points,is_pass,counts_in_result)
 SELECT $1,$2,x.subject,x.role,$3,$4,x.scores::jsonb,x.weighted,x.grade,x.points,x.pass,x.counts
 FROM UNNEST($5::uuid[],$6::text[],$7::text[],$8::numeric[],$9::text[],$10::numeric[],$11::boolean[],$12::boolean[])
      x(subject,role,scores,weighted,grade,points,pass,counts)
 ON CONFLICT(enrollment_id,subject_id,academic_year_id,term_id) DO UPDATE SET category_scores=EXCLUDED.category_scores,weighted_score=EXCLUDED.weighted_score,grade=EXCLUDED.grade,points=EXCLUDED.points,is_pass=EXCLUDED.is_pass,counts_in_result=EXCLUDED.counts_in_result,calculated_at=NOW()""",school_id,uuid.UUID(data["enrollment_id"]),academic_year_id,term_id,[uuid.UUID(x["subject_id"]) for x in subjects],[x["subject_role"] for x in subjects],[json.dumps(x["category_scores"]) for x in subjects],[x["weighted_score"] for x in subjects],[x["grade"] for x in subjects],[x["points"] for x in subjects],[x["is_pass"] for x in subjects],[x["counts_in_result"] for x in subjects])
 t=result["totals"];await conn.execute("""INSERT INTO olevel_student_results(school_id,enrollment_id,academic_year_id,term_id,compulsory_passed,compulsory_failed,optional_passed,optional_failed,subjects_counted,total_points,average_percent,is_promoted,promotion_reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(enrollment_id,academic_year_id,term_id) DO UPDATE SET compulsory_passed=EXCLUDED.compulsory_passed,compulsory_failed=EXCLUDED.compulsory_failed,optional_passed=EXCLUDED.optional_passed,optional_failed=EXCLUDED.optional_failed,subjects_counted=EXCLUDED.subjects_counted,total_points=EXCLUDED.total_points,average_percent=EXCLUDED.average_percent,is_promoted=EXCLUDED.is_promoted,promotion_reason=EXCLUDED.promotion_reason,calculated_at=NOW()""",school_id,uuid.UUID(data["enrollment_id"]),academic_year_id,term_id,t["compulsory_passed"],t["compulsory_failed"],t["optional_passed"],t["optional_failed"],t["subjects_counted"],t["total_points"],t["average_percent"],result["is_promoted"],result["promotion_reason"])
async def grade_student(conn:asyncpg.Connection,school_id:uuid.UUID,*,enrollment_id:uuid.UUID,term_id:uuid.UUID,academic_year_id:uuid.UUID,persist:bool=True)->dict[str,Any]:
 d=await build_enrollment_data(conn,school_id,enrollment_id,term_id,academic_year_id);r=grading_engine.run_grading_pipeline_data(d,await load_rules(conn,school_id,d["curriculum_id"],d["class_level"]))
 if persist: await persist_result(conn,school_id,d,r,term_id,academic_year_id)
 return r
async def grade_class(conn:asyncpg.Connection,school_id:uuid.UUID,*,class_id:uuid.UUID,term_id:uuid.UUID,academic_year_id:uuid.UUID)->dict[str,Any]:
 # Sequential on a single connection — asyncpg connections are not concurrent-safe.
 ids=await conn.fetch("SELECT id FROM student_curriculum_enrollments WHERE school_id=$1 AND class_id=$2 AND academic_year_id=$3",school_id,class_id,academic_year_id)
 for x in ids:
  await grade_student(conn,school_id,enrollment_id=x["id"],term_id=term_id,academic_year_id=academic_year_id)
 return {"calculated":len(ids)}
async def preview(conn:asyncpg.Connection,school_id:uuid.UUID,*,enrollment_id:uuid.UUID,term_id:uuid.UUID,academic_year_id:uuid.UUID)->dict[str,Any]: return await grade_student(conn,school_id,enrollment_id=enrollment_id,term_id=term_id,academic_year_id=academic_year_id,persist=False)
async def recalculate_rankings(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    class_id: uuid.UUID,
    term_id: uuid.UUID,
    academic_year_id: uuid.UUID,
) -> dict[str, Any]:
    await conn.execute(
        """
        WITH ranked AS (
          SELECT r.id,
                 row_number() OVER (ORDER BY r.total_points DESC, r.average_percent DESC) AS pos,
                 count(*) OVER () AS n
          FROM olevel_student_results r
          JOIN student_curriculum_enrollments e ON e.id = r.enrollment_id
          WHERE r.school_id = $1 AND e.class_id = $2
            AND r.term_id = $3 AND r.academic_year_id = $4
        )
        UPDATE olevel_student_results r
        SET class_position = x.pos, total_students_in_class = x.n
        FROM ranked x
        WHERE r.id = x.id
        """,
        school_id,
        class_id,
        term_id,
        academic_year_id,
    )
    await conn.execute(
        """
        WITH ranked AS (
          SELECT sr.id,
                 row_number() OVER (
                   PARTITION BY sr.subject_id
                   ORDER BY sr.weighted_score DESC NULLS LAST, sr.points DESC NULLS LAST
                 ) AS pos
          FROM olevel_subject_results sr
          JOIN student_curriculum_enrollments e ON e.id = sr.enrollment_id
          WHERE sr.school_id = $1 AND e.class_id = $2
            AND sr.term_id = $3 AND sr.academic_year_id = $4
        )
        UPDATE olevel_subject_results sr
        SET subject_position = x.pos
        FROM ranked x
        WHERE sr.id = x.id
        """,
        school_id,
        class_id,
        term_id,
        academic_year_id,
    )
    updated = await conn.fetchval(
        """
        SELECT COUNT(*) FROM olevel_student_results r
        JOIN student_curriculum_enrollments e ON e.id = r.enrollment_id
        WHERE r.school_id=$1 AND e.class_id=$2 AND r.term_id=$3 AND r.academic_year_id=$4
        """,
        school_id,
        class_id,
        term_id,
        academic_year_id,
    )
    return {"updated": updated}
