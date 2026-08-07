"""Shared A-Level report-card assembly for staff and learner portals."""

from __future__ import annotations

import logging
import uuid
from typing import Any

import asyncpg
from fastapi import HTTPException

from app.lib.alevel import compute_student_totals, grade_descriptor
from app.lib.alevel_access import require_exam
from app.lib.storage_urls import resolve_storage_data_uri, resolve_storage_url
from app.lib.teacher_assignments import format_class_name

logger = logging.getLogger(__name__)


SUBJECT_COLUMNS = """
    s.id, s.school_subject_id, ss.name, s.code, s.subject_type, s.is_gp, s.is_active, s.track
"""

ENROLLMENT_SELECT = """
    SELECT e.id, e.student_id, s.full_name AS student_name, s.learner_id,
           s.photo_url AS photo_url,
           e.combination_id, c.name AS combination_name,
           e.academic_year_id, e.subsidiary_subject_id,
           subss.name AS subsidiary_subject_name,
           e.class_id, sc.level, sc.stream, e.is_active
    FROM alevel_enrollments e
    JOIN students s ON s.id = e.student_id
    JOIN alevel_combinations c ON c.id = e.combination_id
    LEFT JOIN alevel_subjects sub ON sub.id = e.subsidiary_subject_id
    LEFT JOIN school_subjects subss ON subss.id = sub.school_subject_id
    LEFT JOIN school_classes sc ON sc.id = e.class_id
"""


def student_initials(full_name: str | None) -> str:
    parts = [p for p in (full_name or "").strip().split() if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return f"{parts[0][0]}{parts[-1][0]}".upper()


def _class_name(row: asyncpg.Record) -> str | None:
    return format_class_name(row["level"], row["stream"]) if row.get("level") else None


async def load_school_branding(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    for_pdf: bool = False,
) -> dict[str, Any]:
    school = await conn.fetchrow(
        """
        SELECT name, logo_url, stamp_url, address, phone, email, phones, emails
        FROM schools WHERE id = $1
        """,
        school_id,
    )
    if not school:
        return {
            "schoolName": None,
            "logoUrl": None,
            "stampUrl": None,
            "schoolAddress": None,
            "schoolPhone": None,
            "schoolEmail": None,
        }

    if for_pdf:
        logo = await resolve_storage_data_uri(school["logo_url"], school_id=school_id)
        stamp = await resolve_storage_data_uri(school["stamp_url"], school_id=school_id)
        if school["logo_url"] and not logo:
            logger.warning(
                "PDF logo embed failed school=%s stored=%s",
                school_id,
                str(school["logo_url"])[:120],
            )
        if school["stamp_url"] and not stamp:
            logger.warning(
                "PDF stamp embed failed school=%s stored=%s",
                school_id,
                str(school["stamp_url"])[:120],
            )
    else:
        logo = await resolve_storage_url(
            school["logo_url"], school_id=school_id, require_exists=True
        )
        stamp = await resolve_storage_url(
            school["stamp_url"], school_id=school_id, require_exists=True
        )
    return {
        "schoolName": school["name"],
        "logoUrl": logo,
        "stampUrl": stamp,
        "schoolAddress": school["address"],
        "schoolPhone": " · ".join(
            p for p in (list(school["phones"] or []) or ([school["phone"]] if school["phone"] else [])) if p
        )
        or None,
        "schoolEmail": " · ".join(
            e for e in (list(school["emails"] or []) or ([school["email"]] if school["email"] else [])) if e
        )
        or None,
    }


async def compute_exam_ranks(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam_id: uuid.UUID,
    classmates: list[dict[str, Any]],
) -> tuple[dict[str, int], int]:
    """Return (studentId -> 1-based position, class_size)."""
    if not classmates:
        return {}, 0

    class_grades = await conn.fetch(
        """
        SELECT student_id, subject_id, grade, points
        FROM alevel_grades
        WHERE school_id = $1 AND exam_id = $2
        """,
        school_id,
        exam_id,
    )
    subj_meta = {
        str(r["id"]): {"subject_type": r["subject_type"], "is_gp": r["is_gp"]}
        for r in await conn.fetch(
            "SELECT id, subject_type, is_gp FROM alevel_subjects WHERE school_id = $1",
            school_id,
        )
    }
    by_stu: dict[str, list[dict[str, Any]]] = {}
    for g in class_grades:
        meta = subj_meta.get(str(g["subject_id"]))
        if not meta:
            continue
        by_stu.setdefault(str(g["student_id"]), []).append(
            {
                "subject_type": meta["subject_type"],
                "is_gp": meta["is_gp"],
                "grade": g["grade"],
                "points": g["points"],
            }
        )

    ranked: list[tuple[str, int, str]] = []
    for c in classmates:
        totals = compute_student_totals(by_stu.get(c["studentId"], []))
        ranked.append((c["studentId"], totals["total_points"], c["studentName"]))
    ranked.sort(key=lambda x: (-x[1], (x[2] or "").lower()))
    positions = {sid: i for i, (sid, _, _) in enumerate(ranked, start=1)}
    return positions, len(ranked)


async def build_report_card_data(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    student_id: uuid.UUID,
    exam_id: uuid.UUID,
    *,
    for_pdf: bool = False,
    branding: dict[str, Any] | None = None,
    ranks: dict[str, int] | None = None,
    class_size: int | None = None,
    classmates: list[dict[str, Any]] | None = None,
    require_approved: bool = False,
    mode: str = "combined",
) -> dict[str, Any]:
    """Assemble one student's report card payload."""
    exam = await require_exam(conn, school_id, exam_id)
    academic_year_id = uuid.UUID(exam["academicYearId"])
    term_id = uuid.UUID(exam["termId"])

    student = await conn.fetchrow(
        f"""
        {ENROLLMENT_SELECT}
        WHERE e.school_id = $1 AND e.student_id = $2 AND e.academic_year_id = $3
        LIMIT 1
        """,
        school_id,
        student_id,
        academic_year_id,
    )
    if not student:
        raise HTTPException(
            status_code=404,
            detail={"error": "Student is not enrolled for this year."},
        )

    grade_rows = await conn.fetch(
        f"""
        SELECT g.raw_score, g.grade, g.points, {SUBJECT_COLUMNS}
        FROM alevel_grades g
        JOIN alevel_subjects s ON s.id = g.subject_id
        JOIN school_subjects ss ON ss.id = s.school_subject_id
        WHERE g.school_id = $1 AND g.student_id = $2 AND g.exam_id = $3
        ORDER BY s.subject_type, ss.name
        """,
        school_id,
        student_id,
        exam_id,
    )
    subjects = [
        {
            "subjectId": str(r["id"]),
            "subjectName": r["name"],
            "code": r["code"],
            "subjectType": r["subject_type"],
            "isGp": r["is_gp"],
            "rawScore": float(r["raw_score"]) if r["raw_score"] is not None else None,
            "grade": r["grade"],
            "points": r["points"],
            "descriptor": grade_descriptor(r["grade"], r["subject_type"]),
        }
        for r in grade_rows
        if mode == "combined"
        or (mode == "secular" and r["track"] in ("secular", "both"))
        or (mode == "theology" and r["track"] in ("theology", "both"))
    ]
    totals = compute_student_totals(subjects)

    position = None
    resolved_class_size = class_size
    if ranks is not None:
        position = ranks.get(str(student_id))
    elif student["class_id"]:
        if classmates is None:
            classmate_rows = await conn.fetch(
                f"""
                {ENROLLMENT_SELECT}
                WHERE e.school_id = $1 AND e.class_id = $2
                  AND e.academic_year_id = $3 AND e.is_active = true
                ORDER BY s.full_name
                """,
                school_id,
                student["class_id"],
                academic_year_id,
            )
            classmates = [
                {
                    "studentId": str(r["student_id"]),
                    "studentName": r["student_name"],
                }
                for r in classmate_rows
            ]
        ranks_map, size = await compute_exam_ranks(
            conn, school_id, exam_id, classmates
        )
        position = ranks_map.get(str(student_id))
        resolved_class_size = size

    meta = await conn.fetchrow(
        """
        SELECT m.class_teacher_comment, m.head_teacher_comment,
               m.approved_at, m.approved_by, u.full_name AS approved_by_name
        FROM alevel_report_metadata m
        LEFT JOIN users u ON u.id = m.approved_by
        WHERE m.school_id = $1 AND m.student_id = $2 AND m.exam_id = $3
        """,
        school_id,
        student_id,
        exam_id,
    )

    approved_at = (
        meta["approved_at"].isoformat() if meta and meta["approved_at"] else None
    )
    if require_approved and not approved_at:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "This report card is not yet approved.",
                "code": "NOT_APPROVED",
            },
        )

    brand = branding or await load_school_branding(
        conn, school_id, for_pdf=for_pdf
    )

    photo_stored = student["photo_url"]
    if for_pdf:
        photo = await resolve_storage_data_uri(photo_stored, school_id=school_id)
    else:
        photo = await resolve_storage_url(
            photo_stored, school_id=school_id, require_exists=True
        )

    name = student["student_name"]
    return {
        "schoolName": brand.get("schoolName"),
        "logoUrl": brand.get("logoUrl"),
        "stampUrl": brand.get("stampUrl"),
        "studentId": str(student_id),
        "studentName": name,
        "studentInitials": student_initials(name),
        "photoUrl": photo,
        "learnerId": student["learner_id"],
        "className": _class_name(student),
        "combinationName": student["combination_name"],
        "examId": exam["id"],
        "examName": exam["name"],
        "examTypeName": exam.get("examTypeName"),
        "termId": str(term_id),
        "termName": exam.get("termName"),
        "academicYearId": str(academic_year_id),
        "subjects": subjects,
        **totals,
        "position": position,
        "classSize": resolved_class_size,
        "classTeacherComment": meta["class_teacher_comment"] if meta else None,
        "headTeacherComment": meta["head_teacher_comment"] if meta else None,
        "approvedAt": approved_at,
        "approvedByName": meta["approved_by_name"] if meta else None,
    }


async def list_approved_report_summaries(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    student_id: uuid.UUID,
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT m.exam_id, m.approved_at, m.class_teacher_comment, m.head_teacher_comment,
               e.name AS exam_name, e.status AS exam_status,
               et.name AS exam_type_name, et.code AS exam_type_code,
               t.name AS term_name, t.id AS term_id,
               ay.id AS academic_year_id, ay.year AS academic_year_label
        FROM alevel_report_metadata m
        JOIN alevel_exams e ON e.id = m.exam_id
        JOIN alevel_exam_types et ON et.id = e.exam_type_id
        JOIN terms t ON t.id = e.term_id
        JOIN academic_years ay ON ay.id = e.academic_year_id
        WHERE m.school_id = $1
          AND m.student_id = $2
          AND m.approved_at IS NOT NULL
        ORDER BY e.opened_at DESC NULLS LAST, e.created_at DESC
        """,
        school_id,
        student_id,
    )

    summaries: list[dict[str, Any]] = []
    for r in rows:
        exam_id = r["exam_id"]
        grade_rows = await conn.fetch(
            """
            SELECT g.grade, g.points, s.subject_type, s.is_gp
            FROM alevel_grades g
            JOIN alevel_subjects s ON s.id = g.subject_id
            WHERE g.school_id = $1 AND g.student_id = $2 AND g.exam_id = $3
            """,
            school_id,
            student_id,
            exam_id,
        )
        totals = compute_student_totals(
            [
                {
                    "subject_type": g["subject_type"],
                    "is_gp": g["is_gp"],
                    "grade": g["grade"],
                    "points": g["points"],
                }
                for g in grade_rows
            ]
        )
        summaries.append(
            {
                "examId": str(exam_id),
                "examName": r["exam_name"],
                "examTypeName": r["exam_type_name"],
                "examTypeCode": r["exam_type_code"],
                "termId": str(r["term_id"]),
                "termName": r["term_name"],
                "academicYearId": str(r["academic_year_id"]),
                "academicYearLabel": str(r["academic_year_label"])
                if r["academic_year_label"] is not None
                else None,
                "approvedAt": r["approved_at"].isoformat() if r["approved_at"] else None,
                "total_points": totals["total_points"],
                "principal_pass_count": totals["principal_pass_count"],
                "result_code": totals["result_code"],
                "hasClassTeacherComment": bool(r["class_teacher_comment"]),
                "hasHeadTeacherComment": bool(r["head_teacher_comment"]),
            }
        )
    return summaries
