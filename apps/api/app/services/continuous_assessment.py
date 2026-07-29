from __future__ import annotations

import uuid
from typing import Any

import asyncpg


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
        INSERT INTO continuous_assessments (
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
        VALUES (
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


async def list_assessments(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
):
    rows = await conn.fetch(
        """
        SELECT
            ca.*,
            sc.level,
            sc.stream,
            ss.name AS subject_name,
            u.full_name AS teacher_name,
            t.name AS term_name
        FROM continuous_assessments ca
        JOIN school_classes sc
            ON sc.id = ca.class_id
        JOIN school_subjects ss
            ON ss.id = ca.subject_id
        JOIN users u
            ON u.id = ca.teacher_id
        JOIN terms t
            ON t.id = ca.term_id
        WHERE ca.school_id=$1
        ORDER BY ca.assessment_date DESC
        """,
        school_id,
    )

    return [dict(r) for r in rows]


async def get_assessment(
    conn: asyncpg.Connection,
    assessment_id: uuid.UUID,
):
    row = await conn.fetchrow(
        """
        SELECT *
        FROM continuous_assessments
        WHERE id=$1
        """,
        assessment_id,
    )

    return dict(row) if row else None


async def submit_assessment(
    conn: asyncpg.Connection,
    assessment_id: uuid.UUID,
    submitted_by: uuid.UUID,
):
    return await conn.fetchrow(
        """
        UPDATE continuous_assessments
        SET
            status='submitted',
            submitted_at=NOW(),
            submitted_by=$2,
            updated_at=NOW()
        WHERE id=$1
        RETURNING *
        """,
        assessment_id,
        submitted_by,
    )


async def unlock_assessment(
    conn: asyncpg.Connection,
    assessment_id: uuid.UUID,
    unlocked_by: uuid.UUID,
):
    return await conn.fetchrow(
        """
        UPDATE continuous_assessments
        SET
            status='draft',
            unlocked_at=NOW(),
            unlocked_by=$2,
            updated_at=NOW()
        WHERE id=$1
        RETURNING *
        """,
        assessment_id,
        unlocked_by,
    )


async def save_student_score(
    conn: asyncpg.Connection,
    *,
    assessment_id: uuid.UUID,
    student_id: uuid.UUID,
    score: float,
    remarks: str | None,
    entered_by: uuid.UUID,
):
    return await conn.fetchrow(
        """
        INSERT INTO assessment_scores(
            assessment_id,
            student_id,
            score,
            remarks,
            entered_by
        )
        VALUES($1,$2,$3,$4,$5)

        ON CONFLICT (assessment_id,student_id)

        DO UPDATE SET

            score=EXCLUDED.score,
            remarks=EXCLUDED.remarks,
            entered_by=EXCLUDED.entered_by,
            updated_at=NOW()

        RETURNING *
        """,
        assessment_id,
        student_id,
        score,
        remarks,
        entered_by,
    )


async def list_scores(
    conn: asyncpg.Connection,
    assessment_id: uuid.UUID,
):
    rows = await conn.fetch(
        """
        SELECT
            s.*,
            st.student_number,
            u.full_name
        FROM assessment_scores s
        JOIN students st
            ON st.id=s.student_id
        JOIN users u
            ON u.id=st.user_id
        WHERE assessment_id=$1
        ORDER BY u.full_name
        """,
        assessment_id,
    )

    return [dict(r) for r in rows]