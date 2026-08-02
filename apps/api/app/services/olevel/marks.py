from __future__ import annotations
import uuid
from typing import Any
import asyncpg
from fastapi import HTTPException
from app.lib.olevel_access import assert_teacher_can_mark_subject
from . import serialize


async def get_mark_grid(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID | None,
    *,
    exam_session_id: uuid.UUID,
    subject_id: uuid.UUID,
    require_assignment: bool = True,
) -> dict[str, Any]:
    s = await conn.fetchrow(
        "SELECT * FROM olevel_exam_sessions WHERE id=$1 AND school_id=$2",
        exam_session_id,
        school_id,
    )
    if not s:
        raise LookupError("Exam session not found.")
    if require_assignment and teacher_id is not None:
        await assert_teacher_can_mark_subject(
            conn, school_id, teacher_id, s["class_id"], subject_id
        )
    rows = await conn.fetch(
        """
        SELECT e.student_id, st.full_name AS student_name, st.learner_id,
               m.raw_score, m.is_absent, m.remarks, m.entered_at
        FROM student_curriculum_enrollments e
        JOIN student_subject_registrations r
          ON r.enrollment_id = e.id AND r.subject_id = $3 AND r.status = 'active'
        JOIN students st ON st.id = e.student_id
        LEFT JOIN olevel_marks m
          ON m.exam_session_id = $4 AND m.student_id = e.student_id AND m.subject_id = $3
        WHERE e.school_id = $1 AND e.class_id = $2
        ORDER BY st.full_name
        """,
        school_id,
        s["class_id"],
        subject_id,
        exam_session_id,
    )
    sub = None
    if teacher_id is not None:
        sub = await conn.fetchrow(
            """
            SELECT * FROM olevel_mark_submissions
            WHERE school_id=$1 AND exam_session_id=$2 AND subject_id=$3 AND teacher_id=$4
            """,
            school_id,
            exam_session_id,
            subject_id,
            teacher_id,
        )
    else:
        sub = await conn.fetchrow(
            """
            SELECT * FROM olevel_mark_submissions
            WHERE school_id=$1 AND exam_session_id=$2 AND subject_id=$3
            ORDER BY submitted_at DESC NULLS LAST
            LIMIT 1
            """,
            school_id,
            exam_session_id,
            subject_id,
        )
    scale = await conn.fetch(
        """
        SELECT gs.* FROM curriculum_grade_scales gs
        WHERE gs.curriculum_id = $1
        ORDER BY gs.display_order
        """,
        s["curriculum_id"],
    )
    return {
        "examSession": serialize.session(s),
        "subjectId": str(subject_id),
        "submissionStatus": sub["status"] if sub else "draft",
        "unlockReason": sub["unlock_reason"] if sub else None,
        "gradeScale": [serialize.grade_scale(x) for x in scale],
        "marks": [serialize.mark(x) for x in rows],
    }


async def bulk_save_marks(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
    *,
    exam_session_id: uuid.UUID,
    subject_id: uuid.UUID,
    marks: list[dict[str, Any]],
    require_assignment: bool = True,
) -> dict[str, Any]:
    s = await conn.fetchrow(
        "SELECT * FROM olevel_exam_sessions WHERE id=$1 AND school_id=$2",
        exam_session_id,
        school_id,
    )
    if not s or s["status"] != "open":
        raise HTTPException(
            422, detail={"error": "Exam session is not open.", "code": "SESSION_NOT_OPEN"}
        )
    if require_assignment:
        await assert_teacher_can_mark_subject(
            conn, school_id, teacher_id, s["class_id"], subject_id
        )
    locked = await conn.fetchval(
        """
        SELECT 1 FROM olevel_mark_submissions
        WHERE school_id=$1 AND exam_session_id=$2 AND subject_id=$3
          AND teacher_id=$4 AND status='submitted'
        """,
        school_id,
        exam_session_id,
        subject_id,
        teacher_id,
    )
    if locked:
        raise HTTPException(
            422, detail={"error": "Submitted marks are locked.", "code": "MARKS_SUBMITTED"}
        )
    ids = [uuid.UUID(str(x.get("student_id") or x.get("studentId"))) for x in marks]
    scores = [x.get("raw_score", x.get("rawScore")) for x in marks]
    absent = [bool(x.get("is_absent", x.get("isAbsent"))) for x in marks]
    remarks = [x.get("remarks") for x in marks]
    if any(
        x is not None and (float(x) < 0 or float(x) > float(s["max_marks"])) for x in scores
    ):
        raise HTTPException(
            422, detail={"error": "Score is outside the session maximum.", "code": "INVALID_SCORE"}
        )
    await conn.execute(
        """
        INSERT INTO olevel_marks(
          school_id, exam_session_id, student_id, subject_id, enrollment_id,
          raw_score, is_absent, remarks, entered_by, entered_at
        )
        SELECT $1, $2, x.student_id, $3, e.id, x.score, x.absent, x.remarks, $4, NOW()
        FROM UNNEST($5::uuid[], $6::numeric[], $7::boolean[], $8::text[])
          x(student_id, score, absent, remarks)
        JOIN student_curriculum_enrollments e
          ON e.student_id = x.student_id AND e.school_id = $1 AND e.class_id = $9
        ON CONFLICT (exam_session_id, student_id, subject_id) DO UPDATE SET
          raw_score = EXCLUDED.raw_score,
          is_absent = EXCLUDED.is_absent,
          remarks = EXCLUDED.remarks,
          entered_by = EXCLUDED.entered_by,
          updated_at = NOW()
        """,
        school_id,
        exam_session_id,
        subject_id,
        teacher_id,
        ids,
        scores,
        absent,
        remarks,
        s["class_id"],
    )
    await conn.execute(
        """
        INSERT INTO olevel_mark_submissions(
          school_id, exam_session_id, subject_id, teacher_id, status
        )
        VALUES ($1, $2, $3, $4, 'draft')
        ON CONFLICT (exam_session_id, subject_id, teacher_id) DO NOTHING
        """,
        school_id,
        exam_session_id,
        subject_id,
        teacher_id,
    )
    return {"saved": len(ids)}
async def submit_marks(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
    *,
    exam_session_id: uuid.UUID,
    subject_id: uuid.UUID,
) -> dict[str, Any]:
    missing = await conn.fetchval(
        """
        SELECT COUNT(*)
        FROM student_curriculum_enrollments e
        JOIN student_subject_registrations r
          ON r.enrollment_id = e.id
         AND r.subject_id = $3
         AND r.status = 'active'
        LEFT JOIN olevel_marks m
          ON m.exam_session_id = $2
         AND m.student_id = e.student_id
         AND m.subject_id = $3
        WHERE e.school_id = $1
          AND e.class_id = (
            SELECT class_id FROM olevel_exam_sessions WHERE id = $2
          )
          AND (
            m.id IS NULL
            OR (m.raw_score IS NULL AND NOT m.is_absent)
          )
        """,
        school_id,
        exam_session_id,
        subject_id,
    )
    if missing:
        raise HTTPException(
            422,
            detail={
                "error": f"{missing} students still need a score or absence.",
                "code": "MISSING_MARKS",
            },
        )
    await conn.execute(
        """
        INSERT INTO olevel_mark_submissions(
          school_id, exam_session_id, subject_id, teacher_id, status, submitted_at
        )
        VALUES ($1, $2, $3, $4, 'submitted', NOW())
        ON CONFLICT (exam_session_id, subject_id, teacher_id) DO UPDATE SET
          status = 'submitted',
          submitted_at = NOW()
        """,
        school_id,
        exam_session_id,
        subject_id,
        teacher_id,
    )
    return {"submitted": True}
async def unlock_marks(conn:asyncpg.Connection,school_id:uuid.UUID,actor_id:uuid.UUID,*,exam_session_id:uuid.UUID,subject_id:uuid.UUID,teacher_id:uuid.UUID,reason:str)->dict[str,Any]:
 await conn.execute("UPDATE olevel_mark_submissions SET status='unlocked',unlocked_at=NOW(),unlocked_by=$5,unlock_reason=$6 WHERE school_id=$1 AND exam_session_id=$2 AND subject_id=$3 AND teacher_id=$4",school_id,exam_session_id,subject_id,teacher_id,actor_id,reason);return {"unlocked":True}
