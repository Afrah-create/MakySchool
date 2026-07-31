"""Primary results queries, comments, overview stats."""

from __future__ import annotations

import uuid
from typing import Any

import asyncpg

from app.lib.primary_access import fetch_class_level, is_lower_primary
from app.lib.primary_reports import THEMATIC_LEVELS
from app.lib.teacher_assignments import format_class_name
from app.services.primary.recalc import recalculate_class_positions


async def class_results(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    class_id: uuid.UUID,
    term_id: uuid.UUID,
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
            "isLowerPrimary": True,
            "students": items,
        }

    rows = await conn.fetch(
        """
        SELECT
          tr.student_id, s.full_name, s.learner_id,
          tr.average_percent, tr.overall_grade, tr.overall_grade_label,
          tr.class_position, tr.total_students,
          tr.class_teacher_comment, tr.head_teacher_comment
        FROM primary_term_results tr
        JOIN students s ON s.id = tr.student_id
        WHERE tr.school_id = $1 AND tr.class_id = $2 AND tr.term_id = $3
        ORDER BY tr.class_position NULLS LAST, s.full_name
        """,
        school_id,
        class_id,
        term_id,
    )

    subject_grades = await conn.fetch(
        """
        SELECT sr.student_id, ps.code, sr.grade, sr.final_percent
        FROM primary_subject_results sr
        JOIN primary_subjects ps ON ps.id = sr.subject_id
        WHERE sr.school_id = $1 AND sr.class_id = $2 AND sr.term_id = $3
        """,
        school_id,
        class_id,
        term_id,
    )
    grades_map: dict[str, dict[str, Any]] = {}
    for g in subject_grades:
        sid = str(g["student_id"])
        grades_map.setdefault(sid, {})[g["code"]] = {
            "grade": g["grade"],
            "finalPercent": float(g["final_percent"]) if g["final_percent"] is not None else None,
        }

    return {
        "classId": str(class_id),
        "className": format_class_name(class_row["level"], class_row["stream"]),
        "termId": str(term_id),
        "termName": term["name"] if term else None,
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
                "classPosition": r["class_position"],
                "totalStudents": r["total_students"],
                "subjectGrades": grades_map.get(str(r["student_id"]), {}),
                "classTeacherComment": r["class_teacher_comment"],
                "headTeacherComment": r["head_teacher_comment"],
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
) -> dict[str, Any]:
    student = await conn.fetchrow(
        """
        SELECT s.id, s.full_name, s.learner_id, s.current_class_id,
               sc.level, sc.stream
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
    base = {
        "student": {
            "id": str(student["id"]),
            "fullName": student["full_name"],
            "learnerId": student["learner_id"],
            "className": class_name,
            "classId": str(student["current_class_id"]) if student["current_class_id"] else None,
        },
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

    subject_rows = await conn.fetch(
        """
        SELECT
          ps.name AS subject_name, ps.code AS subject_code,
          sr.ca_percentage, sr.exam_score, sr.exam_percentage,
          sr.final_percent, sr.grade, sr.grade_label, sr.position,
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
        """,
        school_id,
        student_id,
        term_id,
    )
    base["subjectResults"] = [
        {
            "subjectName": r["subject_name"],
            "subjectCode": r["subject_code"],
            "caPercentage": float(r["ca_percentage"]) if r["ca_percentage"] is not None else None,
            "examScore": float(r["exam_score"]) if r["exam_score"] is not None else None,
            "examPercentage": float(r["exam_percentage"])
            if r["exam_percentage"] is not None
            else None,
            "finalPercent": float(r["final_percent"]) if r["final_percent"] is not None else None,
            "grade": r["grade"],
            "gradeLabel": r["grade_label"],
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
            "classPosition": term_row["class_position"],
            "totalStudents": term_row["total_students"],
            "attendanceDays": term_row["attendance_days"],
            "presentDays": term_row["present_days"],
            "attendancePercent": att_pct,
        }
        base["classTeacherComment"] = term_row["class_teacher_comment"]
        base["headTeacherComment"] = term_row["head_teacher_comment"]
    else:
        base["totals"] = None
        base["classTeacherComment"] = None
        base["headTeacherComment"] = None
    return base


async def save_comments(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    comments: list[dict[str, Any]],
) -> dict[str, Any]:
    updated = 0
    for item in comments:
        student_id = uuid.UUID(str(item["student_id"]))
        term_id = uuid.UUID(str(item["term_id"]))
        result = await conn.execute(
            """
            UPDATE primary_term_results SET
              class_teacher_comment = COALESCE($4, class_teacher_comment),
              head_teacher_comment = COALESCE($5, head_teacher_comment),
              calculated_at = NOW()
            WHERE school_id = $1 AND student_id = $2 AND term_id = $3
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
