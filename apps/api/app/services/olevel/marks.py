from __future__ import annotations

import uuid
from typing import Any

import asyncpg
from fastapi import HTTPException

from app.lib.olevel_access import (
    assert_teacher_can_mark_class,
    assert_teacher_can_mark_subject,
    teacher_olevel_subject_ids,
)

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
          AND e.academic_year_id = $5
        ORDER BY st.full_name
        """,
        school_id,
        s["class_id"],
        subject_id,
        exam_session_id,
        s["academic_year_id"],
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


async def get_session_mark_grid(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
    *,
    exam_session_id: uuid.UUID,
) -> dict[str, Any]:
    """Multi-subject mark sheet for all O-Level subjects a teacher teaches in the class."""
    s = await conn.fetchrow(
        """
        SELECT es.*, c.name AS category_name, c.code AS category_code,
               c.weight_percent AS category_weight_percent,
               CASE WHEN sc.stream IS NULL OR sc.stream = '' THEN sc.level
                    ELSE sc.level || ' ' || sc.stream END AS class_name,
               t.name AS term_name
        FROM olevel_exam_sessions es
        JOIN school_classes sc ON sc.id = es.class_id
        JOIN terms t ON t.id = es.term_id
        JOIN curriculum_assessment_categories c ON c.id = es.category_id
        WHERE es.id = $1 AND es.school_id = $2 AND es.deleted_at IS NULL
        """,
        exam_session_id,
        school_id,
    )
    if not s:
        raise LookupError("Exam session not found.")

    allowed = await assert_teacher_can_mark_class(
        conn, school_id, teacher_id, s["class_id"]
    )
    allowed_uuids = [uuid.UUID(x) for x in allowed]

    subjects = await conn.fetch(
        """
        SELECT id, name, code
        FROM olevel_subjects
        WHERE school_id = $1 AND id = ANY($2::uuid[]) AND is_active = true
        ORDER BY name
        """,
        school_id,
        allowed_uuids,
    )

    students = await conn.fetch(
        """
        SELECT e.id AS enrollment_id, e.student_id,
               st.full_name AS student_name, st.learner_id
        FROM student_curriculum_enrollments e
        JOIN students st ON st.id = e.student_id
        WHERE e.school_id = $1
          AND e.class_id = $2
          AND e.academic_year_id = $3
        ORDER BY st.full_name
        """,
        school_id,
        s["class_id"],
        s["academic_year_id"],
    )

    regs = await conn.fetch(
        """
        SELECT e.student_id, r.subject_id
        FROM student_curriculum_enrollments e
        JOIN student_subject_registrations r
          ON r.enrollment_id = e.id AND r.status = 'active'
        WHERE e.school_id = $1
          AND e.class_id = $2
          AND e.academic_year_id = $3
          AND r.subject_id = ANY($4::uuid[])
        """,
        school_id,
        s["class_id"],
        s["academic_year_id"],
        allowed_uuids,
    )
    registered: dict[str, list[str]] = {}
    for r in regs:
        sid = str(r["student_id"])
        registered.setdefault(sid, []).append(str(r["subject_id"]))

    mark_rows = await conn.fetch(
        """
        SELECT student_id, subject_id, raw_score, is_absent, remarks, entered_at
        FROM olevel_marks
        WHERE school_id = $1
          AND exam_session_id = $2
          AND subject_id = ANY($3::uuid[])
        """,
        school_id,
        exam_session_id,
        allowed_uuids,
    )
    marks: dict[str, dict[str, Any]] = {}
    for m in mark_rows:
        key = f"{m['student_id']}:{m['subject_id']}"
        marks[key] = {
            "rawScore": float(m["raw_score"]) if m["raw_score"] is not None else None,
            "isAbsent": bool(m["is_absent"]),
            "remarks": m["remarks"],
            "enteredAt": m["entered_at"].isoformat() if m["entered_at"] else None,
        }

    subs = await conn.fetch(
        """
        SELECT subject_id, status, submitted_at, unlock_reason
        FROM olevel_mark_submissions
        WHERE school_id = $1
          AND exam_session_id = $2
          AND teacher_id = $3
          AND subject_id = ANY($4::uuid[])
        """,
        school_id,
        exam_session_id,
        teacher_id,
        allowed_uuids,
    )
    sub_by_subject = {str(x["subject_id"]): x for x in subs}
    statuses = [sub_by_subject.get(str(sub["id"]), {}).get("status", "draft") for sub in subjects]
    if statuses and all(st == "submitted" for st in statuses):
        submission_status = "submitted"
    elif any(st == "unlocked" for st in statuses):
        submission_status = "unlocked"
    else:
        submission_status = "draft"

    unlock_reasons = [
        sub_by_subject[str(sub["id"])]["unlock_reason"]
        for sub in subjects
        if str(sub["id"]) in sub_by_subject
        and sub_by_subject[str(sub["id"])]["status"] == "unlocked"
        and sub_by_subject[str(sub["id"])]["unlock_reason"]
    ]
    submitted_ats = [
        sub_by_subject[str(sub["id"])]["submitted_at"]
        for sub in subjects
        if str(sub["id"]) in sub_by_subject
        and sub_by_subject[str(sub["id"])]["submitted_at"]
    ]
    locked_subject_ids = [
        str(sub["id"])
        for sub in subjects
        if sub_by_subject.get(str(sub["id"]), {}).get("status") == "submitted"
    ]
    editable_subject_ids = [
        str(sub["id"])
        for sub in subjects
        if sub_by_subject.get(str(sub["id"]), {}).get("status") != "submitted"
    ]

    scale = await conn.fetch(
        """
        SELECT gs.* FROM curriculum_grade_scales gs
        WHERE gs.curriculum_id = $1
        ORDER BY gs.display_order
        """,
        s["curriculum_id"],
    )

    session_open = s["status"] == "open"
    can_edit = session_open and submission_status != "submitted" and bool(editable_subject_ids)

    return {
        "examSession": serialize.session(s),
        "students": [
            {
                "enrollmentId": str(st["enrollment_id"]),
                "studentId": str(st["student_id"]),
                "studentName": st["student_name"],
                "learnerId": st["learner_id"],
                "registeredSubjectIds": registered.get(str(st["student_id"]), []),
            }
            for st in students
        ],
        "subjects": [
            {"id": str(sub["id"]), "name": sub["name"], "code": sub["code"]}
            for sub in subjects
        ],
        "marks": marks,
        "gradeScale": [serialize.grade_scale(x) for x in scale],
        "editableSubjectIds": editable_subject_ids,
        "lockedSubjectIds": locked_subject_ids,
        "canEdit": can_edit,
        "submissionStatus": submission_status,
        "submittedAt": max(submitted_ats).isoformat() if submitted_ats else None,
        "unlockReason": unlock_reasons[0] if unlock_reasons else None,
        "maxMarks": float(s["max_marks"]),
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
         AND e.academic_year_id = $10
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
        s["academic_year_id"],
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


async def bulk_save_session_marks(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
    *,
    exam_session_id: uuid.UUID,
    entries: list[dict[str, Any]],
) -> dict[str, Any]:
    """Save marks across multiple subjects for one exam session."""
    s = await conn.fetchrow(
        "SELECT * FROM olevel_exam_sessions WHERE id=$1 AND school_id=$2 AND deleted_at IS NULL",
        exam_session_id,
        school_id,
    )
    if not s or s["status"] != "open":
        raise HTTPException(
            422, detail={"error": "Exam session is not open.", "code": "SESSION_NOT_OPEN"}
        )
    allowed = await assert_teacher_can_mark_class(
        conn, school_id, teacher_id, s["class_id"]
    )
    max_marks = float(s["max_marks"])
    saved = 0
    skipped = 0

    locked_rows = await conn.fetch(
        """
        SELECT subject_id FROM olevel_mark_submissions
        WHERE school_id=$1 AND exam_session_id=$2 AND teacher_id=$3
          AND status='submitted' AND subject_id = ANY($4::uuid[])
        """,
        school_id,
        exam_session_id,
        teacher_id,
        [uuid.UUID(x) for x in allowed],
    )
    locked_subjects = {str(r["subject_id"]) for r in locked_rows}

    by_subject: dict[str, list[dict[str, Any]]] = {}
    for entry in entries:
        subject_id = str(entry.get("subject_id") or entry.get("subjectId") or "")
        if not subject_id or subject_id not in allowed:
            skipped += 1
            continue
        if subject_id in locked_subjects:
            skipped += 1
            continue
        by_subject.setdefault(subject_id, []).append(entry)

    for subject_id, subject_entries in by_subject.items():
        marks_payload = []
        for e in subject_entries:
            score = e.get("raw_score", e.get("rawScore"))
            if score is not None and (float(score) < 0 or float(score) > max_marks):
                raise HTTPException(
                    422,
                    detail={
                        "error": "Score is outside the session maximum.",
                        "code": "INVALID_SCORE",
                    },
                )
            marks_payload.append(
                {
                    "studentId": e.get("student_id") or e.get("studentId"),
                    "rawScore": score,
                    "isAbsent": bool(e.get("is_absent", e.get("isAbsent"))),
                    "remarks": e.get("remarks"),
                }
            )
        if not marks_payload:
            continue
        result = await bulk_save_marks(
            conn,
            school_id,
            teacher_id,
            exam_session_id=exam_session_id,
            subject_id=uuid.UUID(subject_id),
            marks=marks_payload,
            require_assignment=False,
        )
        saved += int(result.get("saved") or 0)

    return {"saved": saved, "skipped": skipped}


async def submit_marks(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
    *,
    exam_session_id: uuid.UUID,
    subject_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    """Submit one subject, or all assigned subjects when subject_id is omitted."""
    s = await conn.fetchrow(
        "SELECT * FROM olevel_exam_sessions WHERE id=$1 AND school_id=$2 AND deleted_at IS NULL",
        exam_session_id,
        school_id,
    )
    if not s:
        raise LookupError("Exam session not found.")
    if s["status"] != "open":
        raise HTTPException(
            422, detail={"error": "Exam session is not open.", "code": "SESSION_NOT_OPEN"}
        )

    if subject_id is not None:
        subject_ids = [subject_id]
        await assert_teacher_can_mark_subject(
            conn, school_id, teacher_id, s["class_id"], subject_id
        )
    else:
        allowed = await assert_teacher_can_mark_class(
            conn, school_id, teacher_id, s["class_id"]
        )
        subject_ids = [uuid.UUID(x) for x in allowed]

    for sid in subject_ids:
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
              AND e.class_id = $4
              AND e.academic_year_id = $5
              AND (
                m.id IS NULL
                OR (m.raw_score IS NULL AND NOT m.is_absent)
              )
            """,
            school_id,
            exam_session_id,
            sid,
            s["class_id"],
            s["academic_year_id"],
        )
        if missing:
            name = await conn.fetchval(
                "SELECT name FROM olevel_subjects WHERE id=$1", sid
            )
            raise HTTPException(
                422,
                detail={
                    "error": (
                        f"{missing} students still need a score or absence"
                        + (f" in {name}." if name else ".")
                    ),
                    "code": "MISSING_MARKS",
                    "subjectId": str(sid),
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
            sid,
            teacher_id,
        )
    return {"submitted": True, "subjectCount": len(subject_ids)}


async def unlock_marks(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor_id: uuid.UUID,
    *,
    exam_session_id: uuid.UUID,
    subject_id: uuid.UUID,
    teacher_id: uuid.UUID,
    reason: str,
) -> dict[str, Any]:
    await conn.execute(
        """
        UPDATE olevel_mark_submissions
        SET status='unlocked', unlocked_at=NOW(), unlocked_by=$5, unlock_reason=$6
        WHERE school_id=$1 AND exam_session_id=$2 AND subject_id=$3 AND teacher_id=$4
        """,
        school_id,
        exam_session_id,
        subject_id,
        teacher_id,
        actor_id,
        reason,
    )
    return {"unlocked": True}
