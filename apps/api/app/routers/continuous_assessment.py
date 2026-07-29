from __future__ import annotations

import uuid

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from app.db.pool import get_db
from app.schemas.continuous_assessment import (
    CreateAssessmentRequest,
    EnterScoreRequest,
)
from app.services import continuous_assessment as service

router = APIRouter(tags=["Continuous Assessment"])


@router.get("/")
async def list_assessments(
    school_id: uuid.UUID,
    conn: asyncpg.Connection = Depends(get_db),
):
    return await service.list_assessments(conn, school_id)


@router.get("/{assessment_id}")
async def get_assessment(
    assessment_id: uuid.UUID,
    conn: asyncpg.Connection = Depends(get_db),
):
    assessment = await service.get_assessment(conn, assessment_id)

    if assessment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found.",
        )

    return assessment


@router.post("/")
async def create_assessment(
    school_id: uuid.UUID,
    request: CreateAssessmentRequest,
    conn: asyncpg.Connection = Depends(get_db),
):
    return await service.create_assessment(
        conn,
        school_id=school_id,
        class_id=request.class_id,
        subject_id=request.subject_id,
        teacher_id=request.teacher_id,
        term_id=request.term_id,
        title=request.title,
        assessment_type=request.assessment_type,
        assessment_date=request.assessment_date,
        max_score=request.max_score,
    )


@router.post("/{assessment_id}/submit")
async def submit_assessment(
    assessment_id: uuid.UUID,
    submitted_by: uuid.UUID,
    conn: asyncpg.Connection = Depends(get_db),
):
    return await service.submit_assessment(
        conn,
        assessment_id,
        submitted_by,
    )


@router.post("/{assessment_id}/unlock")
async def unlock_assessment(
    assessment_id: uuid.UUID,
    unlocked_by: uuid.UUID,
    conn: asyncpg.Connection = Depends(get_db),
):
    return await service.unlock_assessment(
        conn,
        assessment_id,
        unlocked_by,
    )


@router.post("/{assessment_id}/scores")
async def save_score(
    assessment_id: uuid.UUID,
    request: EnterScoreRequest,
    conn: asyncpg.Connection = Depends(get_db),
):
    return await service.save_student_score(
        conn,
        assessment_id=assessment_id,
        student_id=request.student_id,
        score=request.score,
        remarks=request.remarks,
        entered_by=request.entered_by,
    )


@router.get("/{assessment_id}/scores")
async def list_scores(
    assessment_id: uuid.UUID,
    conn: asyncpg.Connection = Depends(get_db),
):
    return await service.list_scores(
        conn,
        assessment_id,
    )