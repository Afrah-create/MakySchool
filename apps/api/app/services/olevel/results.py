from __future__ import annotations
import uuid
from typing import Any
import asyncpg
from . import serialize
async def class_results(conn:asyncpg.Connection,school_id:uuid.UUID,*,class_id:uuid.UUID,term_id:uuid.UUID,academic_year_id:uuid.UUID)->dict[str,Any]:
 rows=await conn.fetch("""SELECT r.*,s.full_name student_name,s.learner_id FROM olevel_student_results r JOIN student_curriculum_enrollments e ON e.id=r.enrollment_id JOIN students s ON s.id=e.student_id WHERE r.school_id=$1 AND e.class_id=$2 AND r.term_id=$3 AND r.academic_year_id=$4 ORDER BY r.class_position NULLS LAST,s.full_name""",school_id,class_id,term_id,academic_year_id)
 items=[]
 for r in rows:
  item=serialize.student_result(r); subs=await conn.fetch("SELECT sr.*,os.name subject_name,os.code subject_code FROM olevel_subject_results sr JOIN olevel_subjects os ON os.id=sr.subject_id WHERE sr.enrollment_id=$1 AND sr.term_id=$2 AND sr.academic_year_id=$3 ORDER BY os.name",r["enrollment_id"],term_id,academic_year_id);item["subjectResults"]=[serialize.subject_result(x) for x in subs];items.append(item)
 return {"classId":str(class_id),"termId":str(term_id),"academicYearId":str(academic_year_id),"students":items}
async def student_results(conn:asyncpg.Connection,school_id:uuid.UUID,*,enrollment_id:uuid.UUID)->dict[str,Any]:
 e=await conn.fetchrow("SELECT e.*,s.full_name,s.learner_id FROM student_curriculum_enrollments e JOIN students s ON s.id=e.student_id WHERE e.id=$1 AND e.school_id=$2",enrollment_id,school_id)
 if not e:raise LookupError("Enrollment not found.")
 rows=await conn.fetch("SELECT * FROM olevel_student_results WHERE school_id=$1 AND enrollment_id=$2 ORDER BY academic_year_id,term_id",school_id,enrollment_id)
 return {"enrollment":serialize.enrollment(e),"results":[serialize.student_result(x) for x in rows]}
async def save_comments(conn:asyncpg.Connection,school_id:uuid.UUID,*,enrollment_id:uuid.UUID,term_id:uuid.UUID,academic_year_id:uuid.UUID,class_teacher_comment:str|None=None,head_teacher_comment:str|None=None)->dict[str,Any]:
 await conn.execute("UPDATE olevel_student_results SET class_teacher_comment=COALESCE($5,class_teacher_comment),head_teacher_comment=COALESCE($6,head_teacher_comment) WHERE school_id=$1 AND enrollment_id=$2 AND term_id=$3 AND academic_year_id=$4",school_id,enrollment_id,term_id,academic_year_id,class_teacher_comment,head_teacher_comment);return {"saved":True}
async def approve(conn:asyncpg.Connection,school_id:uuid.UUID,actor_id:uuid.UUID,*,class_id:uuid.UUID,term_id:uuid.UUID,academic_year_id:uuid.UUID)->dict[str,Any]:
 r=await conn.execute("UPDATE olevel_student_results r SET approved_by=$5,approved_at=NOW() FROM student_curriculum_enrollments e WHERE r.enrollment_id=e.id AND r.school_id=$1 AND e.class_id=$2 AND r.term_id=$3 AND r.academic_year_id=$4",school_id,class_id,term_id,academic_year_id,actor_id);return {"approved":int(r.split()[-1])}
