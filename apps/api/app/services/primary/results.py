"""Primary results queries, comments, overview stats."""

from __future__ import annotations

import uuid
from typing import Any

import asyncpg

from app.lib.primary_access import fetch_class_level, is_lower_primary
from app.lib.primary_reports import THEMATIC_LEVELS
from app.lib.teacher_assignments import format_class_name
from app.services.primary.recalc import _has_column, recalculate_class_positions


async def class_results(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    class_id: uuid.UUID,
    term_id: uuid.UUID,
    exam_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    level = await fetch_class_level(conn, school_id, class_id)
    class_row = await conn.fetchrow(
        "SELECT level, stream FROM school_classes WHERE id = $1",
        class_id,
    )
    term = await conn.fetchrow(
        "SELECT name FROM terms WHERE id = $1 AND school_id = $2",
        term_id,
        school_id,
    )

    if is_lower_primary(level):
        # Aggregate thematic into student cards
        students = await conn.fetch(
            """
            SELECT id, full_name, learner_id
            FROM students
            WHERE school_id = $1 AND current_class_id = $2 AND status = 'active'
            ORDER BY full_name
            """,
            school_id,
            class_id,
        )
        assessments = await conn.fetch(
            """
            SELECT student_id, theme_id, strand, level
            FROM primary_thematic_assessments
            WHERE school_id = $1 AND class_id = $2 AND term_id = $3
            """,
            school_id,
            class_id,
            term_id,
        )
        by_student: dict[uuid.UUID, list] = {}
        for a in assessments:
            by_student.setdefault(a["student_id"], []).append(a)

        items = []
        for s in students:
            levels = [a["level"] for a in by_student.get(s["id"], [])]
            avg = sum(levels) / len(levels) if levels else None
            items.append(
                {
                    "studentId": str(s["id"]),
                    "studentName": s["full_name"],
                    "learnerId": s["learner_id"],
                    "thematicCount": len(levels),
                    "averageLevel": round(avg, 2) if avg is not None else None,
                    "isLowerPrimary": True,
                }
            )
        return {
            "classId": str(class_id),
            "className": format_class_name(class_row["level"], class_row["stream"]),
            "termId": str(term_id),
            "termName": term["name"] if term else None,
            "examId": str(exam_id) if exam_id else None,
            "isLowerPrimary": True,
            "students": items,
        }

    if exam_id:
        rows = await conn.fetch(
            """
            SELECT
              tr.student_id, s.full_name, s.learner_id,
              tr.average_percent, tr.overall_grade, tr.overall_grade_label,
              tr.class_position, tr.total_students,
              tr.aggregate, tr.division, tr.exam_id,
              tr.class_teacher_comment, tr.head_teacher_comment,
              tr.approved_at, tr.report_generated
            FROM primary_term_results tr
            JOIN students s ON s.id = tr.student_id
            WHERE tr.school_id = $1 AND tr.class_id = $2 AND tr.exam_id = $3
            ORDER BY tr.class_position NULLS LAST, s.full_name
            """,
            school_id,
            class_id,
            exam_id,
        )
        subject_grades = await conn.fetch(
            """
            SELECT sr.student_id, ps.code, sr.grade, sr.final_percent, sr.grade_points
            FROM primary_subject_results sr
            JOIN primary_subjects ps ON ps.id = sr.subject_id
            WHERE sr.school_id = $1 AND sr.exam_id = $2
            ORDER BY ps.display_order, ps.code
            """,
            school_id,
            exam_id,
        )
    else:
        rows = await conn.fetch(
            """
            SELECT DISTINCT ON (tr.student_id)
              tr.student_id, s.full_name, s.learner_id,
              tr.average_percent, tr.overall_grade, tr.overall_grade_label,
              tr.class_position, tr.total_students,
              tr.aggregate, tr.division, tr.exam_id,
              tr.class_teacher_comment, tr.head_teacher_comment,
              tr.approved_at, tr.report_generated
            FROM primary_term_results tr
            JOIN students s ON s.id = tr.student_id
            WHERE tr.school_id = $1 AND tr.class_id = $2 AND tr.term_id = $3
              AND tr.exam_id IS NOT NULL
            ORDER BY tr.student_id, tr.calculated_at DESC NULLS LAST
            """,
            school_id,
            class_id,
            term_id,
        )
        subject_grades = await conn.fetch(
            """
            SELECT DISTINCT ON (sr.student_id, ps.code)
              sr.student_id, ps.code, sr.grade, sr.final_percent, sr.grade_points
            FROM primary_subject_results sr
            JOIN primary_subjects ps ON ps.id = sr.subject_id
            WHERE sr.school_id = $1 AND sr.class_id = $2 AND sr.term_id = $3
              AND sr.exam_id IS NOT NULL
            ORDER BY sr.student_id, ps.code, sr.calculated_at DESC NULLS LAST
            """,
            school_id,
            class_id,
            term_id,
        )

    rows = sorted(
        rows,
        key=lambda r: (
            r["class_position"] is None,
            r["class_position"] or 0,
            (r["full_name"] or "").lower(),
        ),
    )

    grades_map: dict[str, dict[str, Any]] = {}
    for g in subject_grades:
        sid = str(g["student_id"])
        grades_map.setdefault(sid, {})[g["code"]] = {
            "grade": g["grade"],
            "finalPercent": float(g["final_percent"]) if g["final_percent"] is not None else None,
            "gradePoints": g["grade_points"],
        }

    return {
        "classId": str(class_id),
        "className": format_class_name(class_row["level"], class_row["stream"]),
        "termId": str(term_id),
        "termName": term["name"] if term else None,
        "examId": str(exam_id) if exam_id else None,
        "isLowerPrimary": False,
        "students": [
            {
                "studentId": str(r["student_id"]),
                "studentName": r["full_name"],
                "learnerId": r["learner_id"],
                "averagePercent": float(r["average_percent"])
                if r["average_percent"] is not None
                else None,
                "overallGrade": r["overall_grade"],
                "overallGradeLabel": r["overall_grade_label"],
                "aggregate": r["aggregate"],
                "division": r["division"],
                "examId": str(r["exam_id"]) if r["exam_id"] else None,
                "classPosition": r["class_position"],
                "totalStudents": r["total_students"],
                "subjectGrades": grades_map.get(str(r["student_id"]), {}),
                "classTeacherComment": r["class_teacher_comment"],
                "headTeacherComment": r["head_teacher_comment"],
                "approvedAt": r["approved_at"].isoformat() if r.get("approved_at") else None,
                "reportGenerated": bool(r.get("report_generated")),
                "isLowerPrimary": False,
            }
            for r in rows
        ],
    }


async def student_result(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    student_id: uuid.UUID,
    term_id: uuid.UUID,
    exam_id: uuid.UUID | None = None,
    require_approved: bool = False,
) -> dict[str, Any]:
    student = await conn.fetchrow(
        """
        SELECT s.id, s.full_name, s.learner_id, s.current_class_id, s.photo_url,
               sc.level, sc.stream, s.gender, s.date_of_birth
        FROM students s
        LEFT JOIN school_classes sc ON sc.id = s.current_class_id
        WHERE s.id = $1 AND s.school_id = $2
        """,
        student_id,
        school_id,
    )
    if not student:
        raise LookupError("Student not found.")

    term = await conn.fetchrow(
        """
        SELECT t.id, t.name, t.academic_year_id, ay.year
        FROM terms t
        JOIN academic_years ay ON ay.id = t.academic_year_id
        WHERE t.id = $1 AND t.school_id = $2
        """,
        term_id,
        school_id,
    )
    if not term:
        raise LookupError("Term not found.")

    level = student["level"] or ""
    class_name = (
        format_class_name(student["level"], student["stream"])
        if student["level"]
        else None
    )
    name_parts = [p for p in (student["full_name"] or "").strip().split() if p]
    if not name_parts:
        initials = "?"
    elif len(name_parts) == 1:
        initials = name_parts[0][:2].upper()
    else:
        initials = f"{name_parts[0][0]}{name_parts[-1][0]}".upper()

    base = {
        "student": {
            "id": str(student["id"]),
            "fullName": student["full_name"],
            "learnerId": student["learner_id"],
            "className": class_name,
            "classId": str(student["current_class_id"]) if student["current_class_id"] else None,
            "photoUrl": student["photo_url"],
            "gender": student.get("gender"),
            "dateOfBirth": student["date_of_birth"].isoformat()
            if student.get("date_of_birth")
            else None,
        },
        "studentInitials": initials,
        "termId": str(term["id"]),
        "termName": term["name"],
        "academicYear": term["year"],
        "isLowerPrimary": is_lower_primary(level) if level else False,
    }

    if is_lower_primary(level):
        rows = await conn.fetch(
            """
            SELECT th.name AS theme_name, ta.strand, ta.level, ta.teacher_comment
            FROM primary_thematic_assessments ta
            JOIN primary_themes th ON th.id = ta.theme_id
            WHERE ta.school_id = $1 AND ta.student_id = $2 AND ta.term_id = $3
            ORDER BY th.display_order, ta.strand
            """,
            school_id,
            student_id,
            term_id,
        )
        themes: dict[str, list] = {}
        for r in rows:
            themes.setdefault(r["theme_name"], []).append(
                {
                    "strand": r["strand"],
                    "level": r["level"],
                    "label": THEMATIC_LEVELS.get(r["level"], {}).get("label"),
                    "teacherComment": r["teacher_comment"],
                }
            )
        base["thematicResults"] = [
            {"theme": name, "strands": strands} for name, strands in themes.items()
        ]
        return base

    # Prefer an explicit exam, else the latest exam-scoped result for this term.
    resolved_exam_id = exam_id
    if resolved_exam_id is None:
        latest_exam = await conn.fetchrow(
            """
            SELECT exam_id FROM primary_term_results
            WHERE school_id = $1 AND student_id = $2 AND term_id = $3
              AND exam_id IS NOT NULL
            ORDER BY calculated_at DESC NULLS LAST
            LIMIT 1
            """,
            school_id,
            student_id,
            term_id,
        )
        resolved_exam_id = latest_exam["exam_id"] if latest_exam else None

    has_gp = await _has_column(conn, "primary_subject_results", "grade_points")
    gp_select = "sr.grade_points" if has_gp else "NULL::int AS grade_points"
    has_agg = await _has_column(conn, "primary_term_results", "aggregate")

    if resolved_exam_id:
        subject_rows = await conn.fetch(
            f"""
            SELECT
              ps.name AS subject_name, ps.code AS subject_code, ps.is_ple_subject,
              sr.ca_percentage, sr.exam_score, sr.exam_percentage,
              sr.final_percent, sr.grade, sr.grade_label, {gp_select}, sr.position,
              sr.teacher_comment
            FROM primary_subject_results sr
            JOIN primary_subjects ps ON ps.id = sr.subject_id
            WHERE sr.school_id = $1 AND sr.student_id = $2 AND sr.exam_id = $3
            ORDER BY ps.display_order
            """,
            school_id,
            student_id,
            resolved_exam_id,
        )
        term_row = await conn.fetchrow(
            """
            SELECT tr.*, e.name AS exam_name, et.name AS exam_type_name
            FROM primary_term_results tr
            LEFT JOIN primary_exams e ON e.id = tr.exam_id
            LEFT JOIN primary_exam_types et ON et.id = e.exam_type_id
            WHERE tr.school_id = $1 AND tr.student_id = $2 AND tr.exam_id = $3
            """,
            school_id,
            student_id,
            resolved_exam_id,
        )
    else:
        subject_rows = await conn.fetch(
            f"""
            SELECT
              ps.name AS subject_name, ps.code AS subject_code, ps.is_ple_subject,
              sr.ca_percentage, sr.exam_score, sr.exam_percentage,
              sr.final_percent, sr.grade, sr.grade_label, {gp_select}, sr.position,
              sr.teacher_comment
            FROM primary_subject_results sr
            JOIN primary_subjects ps ON ps.id = sr.subject_id
            WHERE sr.school_id = $1 AND sr.student_id = $2 AND sr.term_id = $3
            ORDER BY ps.display_order
            """,
            school_id,
            student_id,
            term_id,
        )
        term_row = await conn.fetchrow(
            """
            SELECT * FROM primary_term_results
            WHERE school_id = $1 AND student_id = $2 AND term_id = $3
            ORDER BY calculated_at DESC NULLS LAST
            LIMIT 1
            """,
            school_id,
            student_id,
            term_id,
        )

    base["examId"] = str(resolved_exam_id) if resolved_exam_id else None
    base["examName"] = term_row["exam_name"] if term_row and "exam_name" in term_row.keys() else None
    base["examTypeName"] = (
        term_row["exam_type_name"] if term_row and "exam_type_name" in term_row.keys() else None
    )
    base["subjectResults"] = [
        {
            "subjectName": r["subject_name"],
            "subjectCode": r["subject_code"],
            "isPleSubject": bool(r["is_ple_subject"]),
            "caPercentage": float(r["ca_percentage"]) if r["ca_percentage"] is not None else None,
            "examScore": float(r["exam_score"]) if r["exam_score"] is not None else None,
            "examPercentage": float(r["exam_percentage"])
            if r["exam_percentage"] is not None
            else None,
            "finalPercent": float(r["final_percent"]) if r["final_percent"] is not None else None,
            "grade": r["grade"],
            "gradeLabel": r["grade_label"],
            "gradePoints": r["grade_points"],
            "position": r["position"],
            "teacherComment": r["teacher_comment"],
        }
        for r in subject_rows
    ]
    if term_row:
        present = term_row["present_days"]
        days = term_row["attendance_days"]
        att_pct = None
        if present is not None and days and days > 0:
            att_pct = round(present / days * 100, 1)
        base["totals"] = {
            "totalMarks": float(term_row["total_marks"])
            if term_row["total_marks"] is not None
            else None,
            "totalPossible": float(term_row["total_possible"])
            if term_row["total_possible"] is not None
            else None,
            "averagePercent": float(term_row["average_percent"])
            if term_row["average_percent"] is not None
            else None,
            "overallGrade": term_row["overall_grade"],
            "overallGradeLabel": term_row["overall_grade_label"],
            "aggregate": term_row["aggregate"] if has_agg else None,
            "division": term_row["division"] if has_agg else None,
            "classPosition": term_row["class_position"],
            "totalStudents": term_row["total_students"],
            "attendanceDays": term_row["attendance_days"],
            "presentDays": term_row["present_days"],
            "attendancePercent": att_pct,
        }
        base["classTeacherComment"] = term_row["class_teacher_comment"]
        base["headTeacherComment"] = term_row["head_teacher_comment"]
        approved_at = term_row.get("approved_at")
        if require_approved and not approved_at:
            raise LookupError("This report card is not approved yet.")
        base["approvedAt"] = approved_at.isoformat() if approved_at else None
        approved_by = term_row.get("approved_by")
        if approved_by:
            name = await conn.fetchval(
                "SELECT full_name FROM users WHERE id = $1",
                approved_by,
            )
            base["approvedByName"] = name
        else:
            base["approvedByName"] = None
        base["reportGenerated"] = bool(term_row.get("report_generated"))
        # Top-level mirrors for staff/learner UIs (A-Level-aligned).
        base["studentId"] = base["student"]["id"]
        base["studentName"] = base["student"]["fullName"]
        base["learnerId"] = base["student"]["learnerId"]
        base["className"] = base["student"]["className"]
        base["photoUrl"] = base["student"]["photoUrl"]
    else:
        if require_approved:
            raise LookupError("This report card is not approved yet.")
        base["totals"] = None
        base["classTeacherComment"] = None
        base["headTeacherComment"] = None
        base["approvedAt"] = None
        base["approvedByName"] = None
        base["reportGenerated"] = False
    return base


async def upsert_report_comment(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    student_id: uuid.UUID,
    exam_id: uuid.UUID,
    class_teacher_comment: str | None,
    head_teacher_comment: str | None,
    approve: bool,
    actor_id: uuid.UUID,
) -> dict[str, Any]:
    """Insert or update comments/approval on the exam-scoped term result row."""
    from app.lib.primary_exam_access import require_exam

    exam = await require_exam(conn, school_id, exam_id)
    existing = await conn.fetchrow(
        """
        SELECT approved_at FROM primary_term_results
        WHERE school_id = $1 AND student_id = $2 AND exam_id = $3
        """,
        school_id,
        student_id,
        exam_id,
    )
    if existing and existing["approved_at"] and not approve:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=409,
            detail={
                "error": "This report card is approved. Comments are locked.",
                "code": "APPROVED",
            },
        )

    approved_by = actor_id if approve else None
    await conn.execute(
        """
        INSERT INTO primary_term_results (
          school_id, student_id, class_id, term_id, academic_year_id, exam_id,
          class_teacher_comment, head_teacher_comment,
          approved_by, approved_at, calculated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9::uuid,
          CASE WHEN $9::uuid IS NOT NULL THEN NOW() ELSE NULL END,
          NOW()
        )
        ON CONFLICT (exam_id, student_id)
        DO UPDATE SET
          class_teacher_comment = COALESCE(
            EXCLUDED.class_teacher_comment, primary_term_results.class_teacher_comment
          ),
          head_teacher_comment = COALESCE(
            EXCLUDED.head_teacher_comment, primary_term_results.head_teacher_comment
          ),
          approved_by = COALESCE(
            EXCLUDED.approved_by, primary_term_results.approved_by
          ),
          approved_at = COALESCE(
            EXCLUDED.approved_at, primary_term_results.approved_at
          ),
          calculated_at = NOW()
        """,
        school_id,
        student_id,
        uuid.UUID(exam["classId"]),
        uuid.UUID(exam["termId"]),
        uuid.UUID(exam["academicYearId"]),
        exam_id,
        class_teacher_comment,
        head_teacher_comment,
        approved_by,
    )
    return {"ok": True, "approved": approve}


async def bulk_upsert_report_comments(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    exam_id: uuid.UUID,
    student_ids: list[uuid.UUID],
    class_teacher_comment: str | None,
    head_teacher_comment: str | None,
    approve: bool,
    actor_id: uuid.UUID,
) -> dict[str, Any]:
    from app.lib.primary_exam_access import require_exam

    exam = await require_exam(conn, school_id, exam_id)
    class_id = uuid.UUID(exam["classId"])

    roster = await conn.fetch(
        """
        SELECT id FROM students
        WHERE school_id = $1 AND current_class_id = $2 AND status = 'active'
        """,
        school_id,
        class_id,
    )
    enrolled = {r["id"] for r in roster}

    approved_rows = await conn.fetch(
        """
        SELECT student_id FROM primary_term_results
        WHERE school_id = $1 AND exam_id = $2 AND approved_at IS NOT NULL
        """,
        school_id,
        exam_id,
    )
    already_approved = {r["student_id"] for r in approved_rows}

    saved = 0
    skipped_approved = 0
    skipped_not_enrolled = 0
    for sid in student_ids:
        if sid not in enrolled:
            skipped_not_enrolled += 1
            continue
        if sid in already_approved and not approve:
            skipped_approved += 1
            continue
        await upsert_report_comment(
            conn,
            school_id,
            student_id=sid,
            exam_id=exam_id,
            class_teacher_comment=class_teacher_comment,
            head_teacher_comment=head_teacher_comment,
            approve=approve,
            actor_id=actor_id,
        )
        saved += 1
    return {
        "saved": saved,
        "skippedApproved": skipped_approved,
        "skippedNotEnrolled": skipped_not_enrolled,
    }


async def list_approved_report_summaries(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    student_id: uuid.UUID,
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT
          tr.exam_id, tr.term_id, tr.approved_at, tr.aggregate, tr.division,
          tr.average_percent, tr.overall_grade, tr.class_position, tr.total_students,
          tr.class_teacher_comment, tr.head_teacher_comment,
          e.name AS exam_name, et.name AS exam_type_name,
          t.name AS term_name, ay.year AS academic_year
        FROM primary_term_results tr
        JOIN primary_exams e ON e.id = tr.exam_id
        JOIN primary_exam_types et ON et.id = e.exam_type_id
        JOIN terms t ON t.id = tr.term_id
        JOIN academic_years ay ON ay.id = tr.academic_year_id
        WHERE tr.school_id = $1 AND tr.student_id = $2
          AND tr.approved_at IS NOT NULL AND tr.exam_id IS NOT NULL
        ORDER BY tr.approved_at DESC
        """,
        school_id,
        student_id,
    )
    return [
        {
            "examId": str(r["exam_id"]),
            "examName": r["exam_name"],
            "examTypeName": r["exam_type_name"],
            "termId": str(r["term_id"]),
            "termName": r["term_name"],
            "academicYear": r["academic_year"],
            "academicYearLabel": str(r["academic_year"]) if r["academic_year"] is not None else None,
            "approvedAt": r["approved_at"].isoformat() if r["approved_at"] else None,
            "aggregate": r["aggregate"],
            "division": r["division"],
            "averagePercent": float(r["average_percent"])
            if r["average_percent"] is not None
            else None,
            "overallGrade": r["overall_grade"],
            "classPosition": r["class_position"],
            "totalStudents": r["total_students"],
            "hasClassTeacherComment": bool(r["class_teacher_comment"]),
            "hasHeadTeacherComment": bool(r["head_teacher_comment"]),
        }
        for r in rows
    ]


async def save_comments(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    comments: list[dict[str, Any]],
) -> dict[str, Any]:
    """Legacy term-scoped comment update (kept for older clients)."""
    updated = 0
    for item in comments:
        student_id = uuid.UUID(str(item["student_id"]))
        term_id = uuid.UUID(str(item["term_id"]))
        exam_id = item.get("exam_id")
        if exam_id:
            result = await conn.execute(
                """
                UPDATE primary_term_results SET
                  class_teacher_comment = COALESCE($4, class_teacher_comment),
                  head_teacher_comment = COALESCE($5, head_teacher_comment),
                  calculated_at = NOW()
                WHERE school_id = $1 AND student_id = $2 AND exam_id = $3
                  AND approved_at IS NULL
                """,
                school_id,
                student_id,
                uuid.UUID(str(exam_id)),
                item.get("class_teacher_comment"),
                item.get("head_teacher_comment"),
            )
        else:
            result = await conn.execute(
                """
                UPDATE primary_term_results SET
                  class_teacher_comment = COALESCE($4, class_teacher_comment),
                  head_teacher_comment = COALESCE($5, head_teacher_comment),
                  calculated_at = NOW()
                WHERE school_id = $1 AND student_id = $2 AND term_id = $3
                  AND approved_at IS NULL
                """,
                school_id,
                student_id,
                term_id,
                item.get("class_teacher_comment"),
                item.get("head_teacher_comment"),
            )
        if result != "UPDATE 0":
            updated += 1
    return {"updated": updated}


async def refresh_positions(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    class_id: uuid.UUID,
    term_id: uuid.UUID,
) -> dict[str, Any]:
    year_id = await conn.fetchval(
        "SELECT academic_year_id FROM terms WHERE id = $1 AND school_id = $2",
        term_id,
        school_id,
    )
    if not year_id:
        raise LookupError("Term not found.")
    await recalculate_class_positions(
        conn,
        school_id,
        class_id=class_id,
        term_id=term_id,
        academic_year_id=year_id,
    )
    return {"ok": True}


async def overview_stats(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    term_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    setup = await conn.fetchval(
        "SELECT 1 FROM primary_grading_systems WHERE school_id = $1 LIMIT 1",
        school_id,
    )
    primary_students = await conn.fetchval(
        """
        SELECT COUNT(*)::int
        FROM students s
        JOIN school_classes sc ON sc.id = s.current_class_id
        WHERE s.school_id = $1 AND s.status = 'active'
          AND sc.level = ANY($2::text[])
        """,
        school_id,
        ["P1", "P2", "P3", "P4", "P5", "P6", "P7"],
    )
    p7_students = await conn.fetchval(
        """
        SELECT COUNT(*)::int
        FROM students s
        JOIN school_classes sc ON sc.id = s.current_class_id
        WHERE s.school_id = $1 AND s.status = 'active' AND sc.level = 'P7'
        """,
        school_id,
    )
    submitted = 0
    if term_id:
        submitted = await conn.fetchval(
            """
            SELECT COUNT(DISTINCT (class_id, subject_id))::int
            FROM primary_exam_marks
            WHERE school_id = $1 AND term_id = $2 AND submitted = true
              AND exam_type = 'end_of_term'
            """,
            school_id,
            term_id,
        )
    reports = 0
    if term_id:
        reports = await conn.fetchval(
            """
            SELECT COUNT(*)::int FROM primary_term_results
            WHERE school_id = $1 AND term_id = $2 AND report_generated = true
            """,
            school_id,
            term_id,
        )
    return {
        "configured": bool(setup),
        "primaryStudents": primary_students or 0,
        "submittedSubjectSlots": submitted or 0,
        "reportsGenerated": reports or 0,
        "p7Students": p7_students or 0,
    }
