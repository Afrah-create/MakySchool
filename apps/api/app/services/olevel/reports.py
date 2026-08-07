"""O-Level report card assembly for staff and learner portals."""

from __future__ import annotations

import uuid
from typing import Any

import asyncpg
from fastapi import HTTPException

from app.lib.alevel_reports import load_school_branding, student_initials
from app.lib.storage_urls import resolve_storage_data_uri


async def build_report_card_data(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    enrollment_id: uuid.UUID,
    term_id: uuid.UUID,
    academic_year_id: uuid.UUID,
    student_id: uuid.UUID | None = None,
    for_pdf: bool = False,
    require_approved: bool = False,
) -> dict[str, Any]:
    e = await conn.fetchrow(
        """
        SELECT e.*, s.full_name, s.learner_id, s.photo_url,
               CASE WHEN sc.stream IS NULL OR sc.stream = '' THEN sc.level
                    ELSE sc.level || ' ' || sc.stream END AS class_name,
               t.name AS term_name, ay.year AS academic_year
        FROM student_curriculum_enrollments e
        JOIN students s ON s.id = e.student_id
        LEFT JOIN school_classes sc ON sc.id = e.class_id
        LEFT JOIN terms t ON t.id = $3
        LEFT JOIN academic_years ay ON ay.id = $4
        WHERE e.id = $1 AND e.school_id = $2
        """,
        enrollment_id,
        school_id,
        term_id,
        academic_year_id,
    )
    if not e:
        raise LookupError("Enrollment not found.")
    if student_id is not None and e["student_id"] != student_id:
        raise HTTPException(
            404,
            detail={"error": "Report not found.", "code": "NOT_FOUND"},
        )

    result = await conn.fetchrow(
        """
        SELECT r.*, u.full_name AS approved_by_name
        FROM olevel_student_results r
        LEFT JOIN users u ON u.id = r.approved_by
        WHERE r.school_id=$1 AND r.enrollment_id=$2 AND r.term_id=$3 AND r.academic_year_id=$4
        """,
        school_id,
        enrollment_id,
        term_id,
        academic_year_id,
    )
    if not result:
        raise HTTPException(
            422,
            detail={
                "error": "Results not yet calculated for this student.",
                "code": "RESULTS_MISSING",
            },
        )
    if require_approved and not result["approved_at"]:
        raise HTTPException(
            404,
            detail={
                "error": "This report has not been approved yet.",
                "code": "NOT_APPROVED",
            },
        )

    subjects = await conn.fetch(
        """
        SELECT sr.*, os.name AS subject_name, os.code AS subject_code, os.track
        FROM olevel_subject_results sr
        JOIN olevel_subjects os ON os.id = sr.subject_id
        WHERE sr.enrollment_id=$1 AND sr.term_id=$2 AND sr.academic_year_id=$3
        ORDER BY os.name
        """,
        enrollment_id,
        term_id,
        academic_year_id,
    )
    report_rules = await conn.fetchrow(
        "SELECT * FROM curriculum_report_rules WHERE curriculum_id=$1",
        e["curriculum_id"],
    )
    branding = await load_school_branding(conn, school_id, for_pdf=for_pdf)
    photo = await resolve_storage_data_uri(e["photo_url"], school_id=school_id)
    name = e["full_name"]
    rules = {
        "showGrades": bool(report_rules["show_grades"]) if report_rules else True,
        "showPercentages": bool(report_rules["show_percentages"]) if report_rules else True,
        "showPoints": bool(report_rules["show_points"]) if report_rules else True,
        "showTeacherComment": bool(report_rules["show_teacher_comment"]) if report_rules else True,
        "showHeadTeacherComment": (
            bool(report_rules["show_head_teacher_comment"]) if report_rules else True
        ),
        "reportTitle": report_rules["report_title"] if report_rules else "PROGRESS REPORT",
        "customFooterText": report_rules["custom_footer_text"] if report_rules else None,
    }
    return {
        "resultId": str(result["id"]),
        "enrollmentId": str(enrollment_id),
        "studentId": str(e["student_id"]),
        "termId": str(term_id),
        "academicYearId": str(academic_year_id),
        "schoolName": branding.get("schoolName") or branding.get("name"),
        "logoUrl": branding.get("logoUrl"),
        "stampUrl": branding.get("stampUrl"),
        "photoUrl": photo,
        "studentName": name,
        "studentInitials": student_initials(name),
        "learnerId": e["learner_id"],
        "className": e["class_name"],
        "termName": e["term_name"],
        "academicYearName": str(e["academic_year"]) if e["academic_year"] is not None else None,
        "classTeacherComment": result["class_teacher_comment"],
        "headTeacherComment": result["head_teacher_comment"],
        "approvedAt": result["approved_at"].isoformat() if result["approved_at"] else None,
        "approvedByName": result["approved_by_name"],
        "reportRules": rules,
        "subjectResults": [
            {
                "subjectId": str(s["subject_id"]),
                "subjectName": s["subject_name"],
                "subjectCode": s["subject_code"],
                "assessmentPercent": float(s["assessment_percent"] or 0)
                if s.get("assessment_percent") is not None
                else None,
                "examPercent": float(s["exam_percent"] or 0)
                if s.get("exam_percent") is not None
                else None,
                "weightedScore": float(s["weighted_score"] or 0),
                "grade": s["grade"],
                "gradeLabel": s.get("grade_label"),
                "points": float(s["points"] or 0),
            }
            for s in subjects
            if mode == "combined"
            or (mode == "secular" and s["track"] in ("secular", "both"))
            or (mode == "theology" and s["track"] in ("theology", "both"))
        ],
        "totals": {
            "totalPoints": float(result["total_points"] or 0),
            "averagePercent": float(result["average_percent"] or 0),
            "classPosition": result["class_position"],
            "totalStudentsInClass": result["total_students_in_class"],
            "isPromoted": result["is_promoted"],
        },
    }


async def build_report_card_data_by_result_id(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    result_id: uuid.UUID,
    *,
    student_id: uuid.UUID,
    for_pdf: bool = False,
    require_approved: bool = True,
) -> dict[str, Any]:
    row = await conn.fetchrow(
        """
        SELECT r.id, r.enrollment_id, r.term_id, r.academic_year_id, e.student_id
        FROM olevel_student_results r
        JOIN student_curriculum_enrollments e ON e.id = r.enrollment_id
        WHERE r.id = $1 AND r.school_id = $2
        """,
        result_id,
        school_id,
    )
    if not row or row["student_id"] != student_id:
        raise HTTPException(
            404,
            detail={"error": "Report not found.", "code": "NOT_FOUND"},
        )
    return await build_report_card_data(
        conn,
        school_id,
        enrollment_id=row["enrollment_id"],
        term_id=row["term_id"],
        academic_year_id=row["academic_year_id"],
        student_id=student_id,
        for_pdf=for_pdf,
        require_approved=require_approved,
    )


async def list_approved_report_summaries(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    student_id: uuid.UUID,
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT r.id AS result_id, r.enrollment_id, r.term_id, r.academic_year_id,
               r.approved_at, r.total_points, r.average_percent,
               r.class_position, r.total_students_in_class, r.is_promoted,
               r.class_teacher_comment, r.head_teacher_comment,
               t.name AS term_name, ay.year AS academic_year_label,
               CASE WHEN sc.stream IS NULL OR sc.stream = '' THEN sc.level
                    ELSE sc.level || ' ' || sc.stream END AS class_name
        FROM olevel_student_results r
        JOIN student_curriculum_enrollments e ON e.id = r.enrollment_id
        JOIN terms t ON t.id = r.term_id
        JOIN academic_years ay ON ay.id = r.academic_year_id
        LEFT JOIN school_classes sc ON sc.id = e.class_id
        WHERE r.school_id = $1
          AND e.student_id = $2
          AND r.approved_at IS NOT NULL
        ORDER BY ay.year DESC, t.name DESC
        """,
        school_id,
        student_id,
    )
    return [
        {
            "resultId": str(r["result_id"]),
            "enrollmentId": str(r["enrollment_id"]),
            "termId": str(r["term_id"]),
            "termName": r["term_name"],
            "academicYearId": str(r["academic_year_id"]),
            "academicYearLabel": str(r["academic_year_label"])
            if r["academic_year_label"] is not None
            else None,
            "className": r["class_name"],
            "approvedAt": r["approved_at"].isoformat() if r["approved_at"] else None,
            "averagePercent": float(r["average_percent"] or 0),
            "totalPoints": float(r["total_points"] or 0),
            "classPosition": r["class_position"],
            "totalStudentsInClass": r["total_students_in_class"],
            "isPromoted": r["is_promoted"],
            "hasClassTeacherComment": bool(r["class_teacher_comment"]),
            "hasHeadTeacherComment": bool(r["head_teacher_comment"]),
        }
        for r in rows
    ]
