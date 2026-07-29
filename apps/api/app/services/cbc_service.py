from __future__ import annotations

import uuid
from typing import Any

import asyncpg


async def list_assessments(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    class_id: uuid.UUID | None = None,
    subject_id: uuid.UUID | None = None,
    term_id: uuid.UUID | None = None,
):
    sql = """
    SELECT *
    FROM continuous_assessments
    WHERE school_id = $1
    """

    params: list[Any] = [school_id]
    index = 2

    if class_id:
        sql += f" AND class_id = ${index}"
        params.append(class_id)
        index += 1

    if subject_id:
        sql += f" AND subject_id = ${index}"
        params.append(subject_id)
        index += 1

    if term_id:
        sql += f" AND term_id = ${index}"
        params.append(term_id)

    sql += """
    ORDER BY assessment_date DESC,
             created_at DESC
    """

    return await conn.fetch(sql, *params)


async def get_assessment(
    conn: asyncpg.Connection,
    assessment_id: uuid.UUID,
):
    return await conn.fetchrow(
        """
        SELECT *
        FROM continuous_assessments
        WHERE id = $1
        """,
        assessment_id,
    )


async def create_assessment(
    conn: asyncpg.Connection,
    *,
    school_id: uuid.UUID,
    class_id: uuid.UUID,
    subject_id: uuid.UUID,
    teacher_id: uuid.UUID,
    term_id: uuid.UUID,
    title: str,
    assessment_type: str,
    assessment_date,
    max_score: float,
):
    return await conn.fetchrow(
        """
        INSERT INTO continuous_assessments(
            school_id,
            class_id,
            subject_id,
            teacher_id,
            term_id,
            title,
            assessment_type,
            assessment_date,
            max_score
        )
        VALUES(
            $1,$2,$3,$4,$5,$6,$7,$8,$9
        )
        RETURNING *
        """,
        school_id,
        class_id,
        subject_id,
        teacher_id,
        term_id,
        title,
        assessment_type,
        assessment_date,
        max_score,
    )


async def update_assessment(
    conn: asyncpg.Connection,
    *,
    assessment_id: uuid.UUID,
    title: str,
    assessment_type: str,
    assessment_date,
    max_score: float,
):
    return await conn.fetchrow(
        """
        UPDATE continuous_assessments
        SET
            title = $2,
            assessment_type = $3,
            assessment_date = $4,
            max_score = $5,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        """,
        assessment_id,
        title,
        assessment_type,
        assessment_date,
        max_score,
    )


async def delete_assessment(
    conn: asyncpg.Connection,
    assessment_id: uuid.UUID,
):
    await conn.execute(
        """
        DELETE
        FROM continuous_assessments
        WHERE id = $1
        """,
        assessment_id,
    )


async def list_scores(
    conn: asyncpg.Connection,
    assessment_id: uuid.UUID,
):
    return await conn.fetch(
        """
        SELECT
            s.*,
            st.full_name
        FROM assessment_scores s
        JOIN students st
            ON st.id = s.student_id
        WHERE s.assessment_id = $1
        ORDER BY st.full_name
        """,
        assessment_id,
    )


async def save_score(
    conn: asyncpg.Connection,
    *,
    assessment_id: uuid.UUID,
    student_id: uuid.UUID,
    score: float,
    remarks: str | None,
    entered_by: uuid.UUID,
):
    return await conn.execute(
        """
        INSERT INTO assessment_scores(
            assessment_id,
            student_id,
            score,
            remarks,
            entered_by
        )
        VALUES(
            $1,$2,$3,$4,$5
        )
        ON CONFLICT(assessment_id,student_id)
        DO UPDATE
        SET
            score = EXCLUDED.score,
            remarks = EXCLUDED.remarks,
            entered_by = EXCLUDED.entered_by,
            updated_at = NOW()
        """,
        assessment_id,
        student_id,
        score,
        remarks,
        entered_by,
    )