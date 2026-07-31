"""Result recalculation — batch-friendly for large classes."""

from __future__ import annotations

import uuid
from typing import Any

import asyncpg

from app.lib.primary_reports import calculate_final_mark, get_grade_from_percent, round2


async def _grading_context(
    conn: asyncpg.Connection, school_id: uuid.UUID
) -> tuple[float, float, list[dict[str, Any]]]:
    system = await conn.fetchrow(
        """
        SELECT id, ca_weight, exam_weight
        FROM primary_grading_systems
        WHERE school_id = $1 AND is_active = true
        LIMIT 1
        """,
        school_id,
    )
    if not system:
        raise LookupError("Primary grading system is not configured.")
    scales = await conn.fetch(
        """
        SELECT grade, label, min_percent, max_percent
        FROM primary_grade_scales
        WHERE school_id = $1 AND grade_system_id = $2
        ORDER BY min_percent DESC
        """,
        school_id,
        system["id"],
    )
    scale = [
        {
            "grade": s["grade"],
            "label": s["label"],
            "min_percent": float(s["min_percent"]),
            "max_percent": float(s["max_percent"]),
        }
        for s in scales
    ]
    return float(system["ca_weight"]), float(system["exam_weight"]), scale


async def recalculate_subject_result(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    student_id: uuid.UUID,
    class_id: uuid.UUID,
    subject_id: uuid.UUID,
    term_id: uuid.UUID,
    academic_year_id: uuid.UUID,
) -> None:
    ca_weight, exam_weight, scale = await _grading_context(conn, school_id)

    ca = await conn.fetchrow(
        """
        SELECT
          COALESCE(SUM(score), 0) AS ca_total,
          COALESCE(SUM(max_score), 0) AS ca_max
        FROM primary_ca_marks
        WHERE school_id = $1
          AND student_id = $2
          AND subject_id = $3
          AND term_id = $4
          AND score IS NOT NULL
        """,
        school_id,
        student_id,
        subject_id,
        term_id,
    )
    ca_total = float(ca["ca_total"] or 0)
    ca_max = float(ca["ca_max"] or 0)
    ca_pct = round2(ca_total / ca_max * 100) if ca_max > 0 else None

    exam = await conn.fetchrow(
        """
        SELECT score, max_score
        FROM primary_exam_marks
        WHERE school_id = $1
          AND student_id = $2
          AND subject_id = $3
          AND term_id = $4
          AND exam_type = 'end_of_term'
        LIMIT 1
        """,
        school_id,
        student_id,
        subject_id,
        term_id,
    )
    exam_score = float(exam["score"]) if exam and exam["score"] is not None else None
    exam_max = float(exam["max_score"]) if exam else 100.0
    exam_pct = round2(exam_score / exam_max * 100) if exam_score is not None else None

    final_pct = calculate_final_mark(ca_pct, exam_pct, ca_weight, exam_weight)
    grade = None
    grade_label = None
    if final_pct is not None and scale:
        g = get_grade_from_percent(final_pct, scale)
        grade = g["grade"]
        grade_label = g["label"]

    await conn.execute(
        """
        INSERT INTO primary_subject_results (
          school_id, student_id, class_id, subject_id, term_id, academic_year_id,
          ca_total, ca_max, ca_percentage, exam_score, exam_percentage,
          final_percent, grade, grade_label, calculated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
        ON CONFLICT (student_id, subject_id, term_id) DO UPDATE SET
          ca_total = EXCLUDED.ca_total,
          ca_max = EXCLUDED.ca_max,
          ca_percentage = EXCLUDED.ca_percentage,
          exam_score = EXCLUDED.exam_score,
          exam_percentage = EXCLUDED.exam_percentage,
          final_percent = EXCLUDED.final_percent,
          grade = EXCLUDED.grade,
          grade_label = EXCLUDED.grade_label,
          calculated_at = NOW()
        """,
        school_id,
        student_id,
        class_id,
        subject_id,
        term_id,
        academic_year_id,
        ca_total if ca_max > 0 else None,
        ca_max if ca_max > 0 else None,
        ca_pct,
        exam_score,
        exam_pct,
        final_pct,
        grade,
        grade_label,
    )

    await recalculate_term_result(
        conn,
        school_id,
        student_id=student_id,
        class_id=class_id,
        term_id=term_id,
        academic_year_id=academic_year_id,
    )


async def recalculate_subject_results_bulk(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    class_id: uuid.UUID,
    subject_id: uuid.UUID,
    term_id: uuid.UUID,
    academic_year_id: uuid.UUID,
    student_ids: list[uuid.UUID],
) -> None:
    """Recalculate many students for one class/subject/term — used after bulk saves."""
    # Dedupe while preserving order
    seen: set[uuid.UUID] = set()
    unique: list[uuid.UUID] = []
    for sid in student_ids:
        if sid not in seen:
            seen.add(sid)
            unique.append(sid)

    for sid in unique:
        await recalculate_subject_result(
            conn,
            school_id,
            student_id=sid,
            class_id=class_id,
            subject_id=subject_id,
            term_id=term_id,
            academic_year_id=academic_year_id,
        )

    await recalculate_class_positions(
        conn, school_id, class_id=class_id, term_id=term_id, academic_year_id=academic_year_id
    )


async def recalculate_term_result(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    student_id: uuid.UUID,
    class_id: uuid.UUID,
    term_id: uuid.UUID,
    academic_year_id: uuid.UUID,
) -> None:
    _, _, scale = await _grading_context(conn, school_id)

    row = await conn.fetchrow(
        """
        SELECT
          COALESCE(SUM(final_percent), 0) AS total_marks,
          COUNT(*) FILTER (WHERE final_percent IS NOT NULL) AS subject_count,
          AVG(final_percent) FILTER (WHERE final_percent IS NOT NULL) AS average_percent
        FROM primary_subject_results
        WHERE school_id = $1 AND student_id = $2 AND term_id = $3
        """,
        school_id,
        student_id,
        term_id,
    )
    subject_count = int(row["subject_count"] or 0)
    average = float(row["average_percent"]) if row["average_percent"] is not None else None
    total_marks = float(row["total_marks"] or 0)
    total_possible = float(subject_count * 100) if subject_count else None

    overall_grade = None
    overall_label = None
    if average is not None and scale:
        g = get_grade_from_percent(round2(average), scale)
        overall_grade = g["grade"]
        overall_label = g["label"]

    await conn.execute(
        """
        INSERT INTO primary_term_results (
          school_id, student_id, class_id, term_id, academic_year_id,
          total_marks, total_possible, average_percent,
          overall_grade, overall_grade_label, calculated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
        ON CONFLICT (student_id, term_id) DO UPDATE SET
          total_marks = EXCLUDED.total_marks,
          total_possible = EXCLUDED.total_possible,
          average_percent = EXCLUDED.average_percent,
          overall_grade = EXCLUDED.overall_grade,
          overall_grade_label = EXCLUDED.overall_grade_label,
          calculated_at = NOW()
        """,
        school_id,
        student_id,
        class_id,
        term_id,
        academic_year_id,
        total_marks if subject_count else None,
        total_possible,
        round2(average) if average is not None else None,
        overall_grade,
        overall_label,
    )


async def recalculate_class_positions(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    class_id: uuid.UUID,
    term_id: uuid.UUID,
    academic_year_id: uuid.UUID,
) -> None:
    rows = await conn.fetch(
        """
        SELECT id, average_percent
        FROM primary_term_results
        WHERE school_id = $1 AND class_id = $2 AND term_id = $3
          AND average_percent IS NOT NULL
        ORDER BY average_percent DESC, student_id
        """,
        school_id,
        class_id,
        term_id,
    )
    total = len(rows)
    position = 0
    last_avg: float | None = None
    updates: list[tuple[int, int, uuid.UUID]] = []
    for index, row in enumerate(rows, start=1):
        avg = float(row["average_percent"])
        if last_avg is None or avg < last_avg:
            position = index
            last_avg = avg
        updates.append((position, total, row["id"]))

    if updates:
        await conn.executemany(
            """
            UPDATE primary_term_results
            SET class_position = $1, total_students = $2, calculated_at = NOW()
            WHERE id = $3
            """,
            updates,
        )

    # Per-subject positions
    subject_rows = await conn.fetch(
        """
        SELECT id, subject_id, final_percent
        FROM primary_subject_results
        WHERE school_id = $1 AND class_id = $2 AND term_id = $3
          AND final_percent IS NOT NULL
        ORDER BY subject_id, final_percent DESC, student_id
        """,
        school_id,
        class_id,
        term_id,
    )
    by_subject: dict[uuid.UUID, list[asyncpg.Record]] = {}
    for row in subject_rows:
        by_subject.setdefault(row["subject_id"], []).append(row)

    subject_updates: list[tuple[int, uuid.UUID]] = []
    for group in by_subject.values():
        position = 0
        last: float | None = None
        for index, row in enumerate(group, start=1):
            pct = float(row["final_percent"])
            if last is None or pct < last:
                position = index
                last = pct
            subject_updates.append((position, row["id"]))

    if subject_updates:
        await conn.executemany(
            """
            UPDATE primary_subject_results
            SET position = $1, calculated_at = NOW()
            WHERE id = $2
            """,
            subject_updates,
        )
