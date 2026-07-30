from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends

from app.db.pool import get_db

from app.services.continuous_assessment.schemas import (
    AssessmentDetailsResponse,
    AssessmentResponse,
    CreateAssessmentRequest,
    SubmitScoresRequest,
)
from app.services.continuous_assessment.service import (
    create_assessment,
    get_assessment,
    list_assessments,
    save_scores,
)

router = APIRouter(tags=["Continuous Assessment"])


# TODO:
# Replace these with your real authentication dependency later.
def current_school_id() -> UUID:
    return UUID("00000000-0000-0000-0000-000000000001")


def current_teacher_id() -> UUID:
    return UUID("00000000-0000-0000-0000-000000000001")


@router.get("/", response_model=list[AssessmentResponse])
async def get_assessments(
    conn: asyncpg.Connection = Depends(get_db),
):
    return await list_assessments(
        conn,
        school_id=current_school_id(),
    )


@router.post("/", response_model=AssessmentResponse)
async def create_new_assessment(
    request: CreateAssessmentRequest,
    conn: asyncpg.Connection = Depends(get_db),
):
    return await create_assessment(
        conn,
        school_id=current_school_id(),
        teacher_id=current_teacher_id(),
        class_id=request.class_id,
        subject_id=request.subject_id,
        term_id=request.term_id,
        title=request.title,
        assessment_type=request.assessment_type,
        assessment_date=request.assessment_date,
        max_score=request.max_score,
    )


@router.get("/{assessment_id}", response_model=AssessmentDetailsResponse)
async def assessment_details(
    assessment_id: UUID,
    conn: asyncpg.Connection = Depends(get_db),
):
    return await get_assessment(
        conn,
        assessment_id=assessment_id,
    )


@router.post("/{assessment_id}/scores")
async def enter_scores(
    assessment_id: UUID,
    request: SubmitScoresRequest,
    conn: asyncpg.Connection = Depends(get_db),
):
    await save_scores(
        conn,
        assessment_id=assessment_id,
        teacher_id=current_teacher_id(),
        scores=request.scores,
    )

    return {"message": "Scores saved successfully."}