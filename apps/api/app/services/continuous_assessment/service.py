from uuid import UUID

import asyncpg

from .schemas import (
    AssessmentDetailsResponse,
    AssessmentResponse,
    ScoreResponse,
    StudentScoreRequest,
)


async def create_assessment(
    conn: asyncpg.Connection,
    *,
    school_id: UUID,
    class_id: UUID,
    subject_id: UUID,
    teacher_id: UUID,
    term_id: UUID,
    title: str,
    assessment_type: str,
    assessment_date,
    max_score,
):
    row = await conn.fetchrow(
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
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
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

    return AssessmentResponse(**dict(row))


async def list_assessments(
    conn: asyncpg.Connection,
    *,
    school_id: UUID,
):
    rows = await conn.fetch(
        """
        SELECT *
        FROM continuous_assessments
        WHERE school_id=$1
        ORDER BY assessment_date DESC
        """,
        school_id,
    )

    return [AssessmentResponse(**dict(r)) for r in rows]


async def save_scores(
    conn: asyncpg.Connection,
    *,
    assessment_id: UUID,
    teacher_id: UUID,
    scores: list[StudentScoreRequest],
):
    for score in scores:
        await conn.execute(
            """
            INSERT INTO assessment_scores(
                assessment_id,
                student_id,
                score,
                remarks,
                entered_by
            )
            VALUES($1,$2,$3,$4,$5)
            ON CONFLICT (assessment_id, student_id)
            DO UPDATE
            SET
                score=EXCLUDED.score,
                remarks=EXCLUDED.remarks,
                entered_by=EXCLUDED.entered_by,
                updated_at=NOW()
            """,
            assessment_id,
            score.student_id,
            score.score,
            score.remarks,
            teacher_id,
        )


async def get_assessment(
    conn: asyncpg.Connection,
    *,
    assessment_id: UUID,
):
    assessment = await conn.fetchrow(
        """
        SELECT *
        FROM continuous_assessments
        WHERE id=$1
        """,
        assessment_id,
    )

    scores = await conn.fetch(
        """
        SELECT
            student_id,
            score,
            remarks
        FROM assessment_scores
        WHERE assessment_id=$1
        ORDER BY student_id
        """,
        assessment_id,
    )

    return AssessmentDetailsResponse(
        assessment=AssessmentResponse(**dict(assessment)),
        scores=[ScoreResponse(**dict(s)) for s in scores],
    )


async def submit_assessment(
    conn: asyncpg.Connection,
    assessment_id: UUID,
    submitted_by: UUID,
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
    assessment_id: UUID,
    unlocked_by: UUID,
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
