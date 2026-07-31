"""Bulk marks entry for primary CA, exams, and thematic assessments."""

from __future__ import annotations

import uuid
from typing import Any

import asyncpg

from app.lib.primary_access import (
    fetch_class_level,
    is_lower_primary,
    is_upper_primary,
)
from app.lib.primary_reports import BULK_MARKS_LIMIT, DEFAULT_STRANDS
from app.services.primary.recalc import recalculate_subject_results_bulk


async def _resolve_term_year(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    term_id: uuid.UUID,
) -> uuid.UUID:
    row = await conn.fetchrow(
        """
        SELECT academic_year_id FROM terms
        WHERE id = $1 AND school_id = $2
        """,
        term_id,
        school_id,
    )
    if not row:
        raise LookupError("Term not found.")
    return row["academic_year_id"]


async def _assert_subject_marks_allowed(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    class_id: uuid.UUID,
) -> str:
    level = await fetch_class_level(conn, school_id, class_id)
    if is_lower_primary(level):
        raise ValueError(
            "Subject marks are only for P4–P7. Use thematic assessment for P1–P3."
        )
    if not is_upper_primary(level):
        raise ValueError("Primary subject marks only apply to P4–P7.")
    return level


async def _assert_thematic_allowed(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    class_id: uuid.UUID,
) -> str:
    level = await fetch_class_level(conn, school_id, class_id)
    if is_lower_primary(level):
        return level
    if level == "P4":
        flag = await conn.fetchval(
            """
            SELECT allow_thematic_in_p4 FROM primary_grading_systems
            WHERE school_id = $1 AND is_active = true
            """,
            school_id,
        )
        if flag:
            return level
    raise ValueError(
        "Thematic assessment is only for P1–P3"
        + (" (or P4 when enabled in setup)." if level == "P4" else ".")
        + " Use subject marks entry for P4 and above."
    )


async def bulk_upsert_ca(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor_id: uuid.UUID,
    *,
    class_id: uuid.UUID,
    subject_id: uuid.UUID,
    ca_title: str,
    ca_type: str,
    max_score: float,
    term_id: uuid.UUID,
    marks: list[dict[str, Any]],
) -> dict[str, Any]:
    await _assert_subject_marks_allowed(conn, school_id, class_id)
    if len(marks) > BULK_MARKS_LIMIT:
        raise ValueError(f"Bulk CA is limited to {BULK_MARKS_LIMIT} students per request.")
    if max_score <= 0:
        raise ValueError("max_score must be greater than zero.")

    academic_year_id = await _resolve_term_year(conn, school_id, term_id)
    title = ca_title.strip()
    if not title:
        raise ValueError("CA title is required.")

    student_ids: list[uuid.UUID] = []
    scores: list[float | None] = []
    for item in marks:
        sid = uuid.UUID(str(item["student_id"]))
        score = item.get("score")
        if score is not None:
            score = float(score)
            if score < 0 or score > max_score:
                raise ValueError(f"Score must be between 0 and {max_score}.")
        student_ids.append(sid)
        scores.append(score)

    if not student_ids:
        return {"saved": 0, "studentIds": []}

    await conn.execute(
        """
        INSERT INTO primary_ca_marks (
          school_id, student_id, class_id, subject_id,
          ca_title, ca_type, max_score, score,
          term_id, academic_year_id, recorded_by, updated_at
        )
        SELECT
          $1,
          x.student_id,
          $2,
          $3,
          $4,
          $5,
          $6,
          x.score,
          $7,
          $8,
          $9,
          NOW()
        FROM UNNEST($10::uuid[], $11::numeric[]) AS x(student_id, score)
        ON CONFLICT (student_id, subject_id, term_id, ca_title, ca_type)
        DO UPDATE SET
          max_score = EXCLUDED.max_score,
          score = EXCLUDED.score,
          recorded_by = EXCLUDED.recorded_by,
          updated_at = NOW()
        """,
        school_id,
        class_id,
        subject_id,
        title,
        ca_type,
        max_score,
        term_id,
        academic_year_id,
        actor_id,
        student_ids,
        scores,
    )

    await recalculate_subject_results_bulk(
        conn,
        school_id,
        class_id=class_id,
        subject_id=subject_id,
        term_id=term_id,
        academic_year_id=academic_year_id,
        student_ids=student_ids,
    )
    return {"saved": len(student_ids), "studentIds": [str(s) for s in student_ids]}


async def bulk_upsert_exams(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor_id: uuid.UUID,
    *,
    class_id: uuid.UUID,
    subject_id: uuid.UUID,
    exam_type: str,
    max_score: float,
    term_id: uuid.UUID,
    marks: list[dict[str, Any]],
) -> dict[str, Any]:
    await _assert_subject_marks_allowed(conn, school_id, class_id)
    if len(marks) > BULK_MARKS_LIMIT:
        raise ValueError(f"Bulk exams are limited to {BULK_MARKS_LIMIT} students per request.")
    if max_score <= 0:
        raise ValueError("max_score must be greater than zero.")

    # Block edits if already submitted (end_of_term)
    locked = await conn.fetchval(
        """
        SELECT EXISTS(
          SELECT 1 FROM primary_exam_marks
          WHERE school_id = $1 AND class_id = $2 AND subject_id = $3
            AND term_id = $4 AND exam_type = $5 AND submitted = true
        )
        """,
        school_id,
        class_id,
        subject_id,
        term_id,
        exam_type,
    )
    if locked:
        raise PermissionError(
            "These exam marks are submitted and locked. An admin must unlock them first."
        )

    academic_year_id = await _resolve_term_year(conn, school_id, term_id)
    student_ids: list[uuid.UUID] = []
    scores: list[float | None] = []
    for item in marks:
        sid = uuid.UUID(str(item["student_id"]))
        score = item.get("score")
        if score is not None:
            score = float(score)
            if score < 0 or score > max_score:
                raise ValueError(f"Score must be between 0 and {max_score}.")
        student_ids.append(sid)
        scores.append(score)

    if not student_ids:
        return {"saved": 0, "studentIds": []}

    await conn.execute(
        """
        INSERT INTO primary_exam_marks (
          school_id, student_id, class_id, subject_id,
          exam_type, max_score, score, term_id, academic_year_id,
          recorded_by, updated_at
        )
        SELECT
          $1, x.student_id, $2, $3, $4, $5, x.score, $6, $7, $8, NOW()
        FROM UNNEST($9::uuid[], $10::numeric[]) AS x(student_id, score)
        ON CONFLICT (student_id, subject_id, exam_type, term_id)
        DO UPDATE SET
          max_score = EXCLUDED.max_score,
          score = EXCLUDED.score,
          recorded_by = EXCLUDED.recorded_by,
          updated_at = NOW()
        WHERE primary_exam_marks.submitted = false
        """,
        school_id,
        class_id,
        subject_id,
        exam_type,
        max_score,
        term_id,
        academic_year_id,
        actor_id,
        student_ids,
        scores,
    )

    if exam_type == "end_of_term":
        await recalculate_subject_results_bulk(
            conn,
            school_id,
            class_id=class_id,
            subject_id=subject_id,
            term_id=term_id,
            academic_year_id=academic_year_id,
            student_ids=student_ids,
        )

    return {"saved": len(student_ids), "studentIds": [str(s) for s in student_ids]}


async def submit_exams(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    class_id: uuid.UUID,
    subject_id: uuid.UUID,
    term_id: uuid.UUID,
    exam_type: str = "end_of_term",
) -> dict[str, Any]:
    missing = await conn.fetch(
        """
        SELECT s.full_name
        FROM students s
        LEFT JOIN primary_exam_marks em
          ON em.student_id = s.id
         AND em.subject_id = $3
         AND em.term_id = $4
         AND em.exam_type = $5
         AND em.school_id = $1
        WHERE s.school_id = $1
          AND s.current_class_id = $2
          AND s.status = 'active'
          AND (em.id IS NULL OR em.score IS NULL)
        ORDER BY s.full_name
        LIMIT 50
        """,
        school_id,
        class_id,
        subject_id,
        term_id,
        exam_type,
    )
    result = await conn.execute(
        """
        UPDATE primary_exam_marks
        SET submitted = true, submitted_at = NOW(), updated_at = NOW()
        WHERE school_id = $1 AND class_id = $2 AND subject_id = $3
          AND term_id = $4 AND exam_type = $5 AND submitted = false
        """,
        school_id,
        class_id,
        subject_id,
        term_id,
        exam_type,
    )
    # result like "UPDATE N"
    updated = int(result.split()[-1]) if result else 0
    return {
        "submitted": updated,
        "missingScores": [r["full_name"] for r in missing],
        "missingCount": len(missing),
    }


async def unlock_exams(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    class_id: uuid.UUID,
    subject_id: uuid.UUID,
    term_id: uuid.UUID,
    exam_type: str = "end_of_term",
) -> dict[str, Any]:
    result = await conn.execute(
        """
        UPDATE primary_exam_marks
        SET submitted = false, submitted_at = NULL, updated_at = NOW()
        WHERE school_id = $1 AND class_id = $2 AND subject_id = $3
          AND term_id = $4 AND exam_type = $5 AND submitted = true
        """,
        school_id,
        class_id,
        subject_id,
        term_id,
        exam_type,
    )
    updated = int(result.split()[-1]) if result else 0
    return {"unlocked": updated}


async def bulk_upsert_thematic(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor_id: uuid.UUID,
    *,
    class_id: uuid.UUID,
    theme_id: uuid.UUID,
    strand: str,
    term_id: uuid.UUID,
    assessments: list[dict[str, Any]],
) -> dict[str, Any]:
    await _assert_thematic_allowed(conn, school_id, class_id)
    if len(assessments) > BULK_MARKS_LIMIT:
        raise ValueError(
            f"Bulk thematic entry is limited to {BULK_MARKS_LIMIT} students per request."
        )
    strand_clean = strand.strip()
    if strand_clean not in DEFAULT_STRANDS and not strand_clean:
        raise ValueError("Strand is required.")

    academic_year_id = await _resolve_term_year(conn, school_id, term_id)

    student_ids: list[uuid.UUID] = []
    levels: list[int] = []
    comments: list[str | None] = []
    for item in assessments:
        sid = uuid.UUID(str(item["student_id"]))
        level = int(item["level"])
        if level not in (1, 2, 3, 4):
            raise ValueError("Thematic level must be 1–4.")
        student_ids.append(sid)
        levels.append(level)
        comments.append((item.get("teacher_comment") or None))

    if not student_ids:
        return {"saved": 0}

    await conn.execute(
        """
        INSERT INTO primary_thematic_assessments (
          school_id, student_id, class_id, theme_id, strand, level,
          term_id, academic_year_id, teacher_comment, recorded_by, updated_at
        )
        SELECT
          $1, x.student_id, $2, $3, $4, x.level, $5, $6, x.comment, $7, NOW()
        FROM UNNEST($8::uuid[], $9::int[], $10::text[])
          AS x(student_id, level, comment)
        ON CONFLICT (student_id, theme_id, strand, term_id)
        DO UPDATE SET
          level = EXCLUDED.level,
          teacher_comment = EXCLUDED.teacher_comment,
          recorded_by = EXCLUDED.recorded_by,
          updated_at = NOW()
        WHERE primary_thematic_assessments.submitted = false
        """,
        school_id,
        class_id,
        theme_id,
        strand_clean,
        term_id,
        academic_year_id,
        actor_id,
        student_ids,
        levels,
        comments,
    )
    return {"saved": len(student_ids)}


async def list_ca(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    class_id: uuid.UUID,
    subject_id: uuid.UUID,
    term_id: uuid.UUID,
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT
          ca.id, ca.student_id, s.full_name AS student_name, s.learner_id,
          ca.ca_title, ca.ca_type, ca.max_score, ca.score, ca.created_at
        FROM primary_ca_marks ca
        JOIN students s ON s.id = ca.student_id
        WHERE ca.school_id = $1 AND ca.class_id = $2
          AND ca.subject_id = $3 AND ca.term_id = $4
        ORDER BY ca.ca_title, s.full_name
        """,
        school_id,
        class_id,
        subject_id,
        term_id,
    )
    return [
        {
            "id": str(r["id"]),
            "studentId": str(r["student_id"]),
            "studentName": r["student_name"],
            "learnerId": r["learner_id"],
            "caTitle": r["ca_title"],
            "caType": r["ca_type"],
            "maxScore": float(r["max_score"]),
            "score": float(r["score"]) if r["score"] is not None else None,
        }
        for r in rows
    ]


async def list_exams(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    class_id: uuid.UUID,
    subject_id: uuid.UUID,
    term_id: uuid.UUID,
    exam_type: str | None = None,
) -> list[dict[str, Any]]:
    args: list[Any] = [school_id, class_id, subject_id, term_id]
    type_filter = ""
    if exam_type:
        type_filter = "AND em.exam_type = $5"
        args.append(exam_type)
    rows = await conn.fetch(
        f"""
        SELECT
          em.id, em.student_id, s.full_name AS student_name, s.learner_id,
          em.exam_type, em.max_score, em.score, em.submitted,
          sr.ca_percentage, sr.final_percent, sr.grade, sr.grade_label
        FROM primary_exam_marks em
        JOIN students s ON s.id = em.student_id
        LEFT JOIN primary_subject_results sr
          ON sr.student_id = em.student_id
         AND sr.subject_id = em.subject_id
         AND sr.term_id = em.term_id
        WHERE em.school_id = $1 AND em.class_id = $2
          AND em.subject_id = $3 AND em.term_id = $4
          {type_filter}
        ORDER BY s.full_name, em.exam_type
        """,
        *args,
    )
    return [
        {
            "id": str(r["id"]),
            "studentId": str(r["student_id"]),
            "studentName": r["student_name"],
            "learnerId": r["learner_id"],
            "examType": r["exam_type"],
            "maxScore": float(r["max_score"]),
            "score": float(r["score"]) if r["score"] is not None else None,
            "submitted": bool(r["submitted"]),
            "caPercentage": float(r["ca_percentage"]) if r["ca_percentage"] is not None else None,
            "finalPercent": float(r["final_percent"]) if r["final_percent"] is not None else None,
            "grade": r["grade"],
            "gradeLabel": r["grade_label"],
        }
        for r in rows
    ]


async def list_thematic(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    class_id: uuid.UUID,
    term_id: uuid.UUID,
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT
          ta.id, ta.student_id, s.full_name AS student_name, s.learner_id,
          ta.theme_id, th.name AS theme_name, ta.strand, ta.level,
          ta.teacher_comment, ta.submitted
        FROM primary_thematic_assessments ta
        JOIN students s ON s.id = ta.student_id
        JOIN primary_themes th ON th.id = ta.theme_id
        WHERE ta.school_id = $1 AND ta.class_id = $2 AND ta.term_id = $3
        ORDER BY th.display_order, ta.strand, s.full_name
        """,
        school_id,
        class_id,
        term_id,
    )
    return [
        {
            "id": str(r["id"]),
            "studentId": str(r["student_id"]),
            "studentName": r["student_name"],
            "learnerId": r["learner_id"],
            "themeId": str(r["theme_id"]),
            "themeName": r["theme_name"],
            "strand": r["strand"],
            "level": r["level"],
            "teacherComment": r["teacher_comment"],
            "submitted": bool(r["submitted"]),
        }
        for r in rows
    ]
