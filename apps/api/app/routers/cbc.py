from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated, Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.db.pool import get_db
from app.lib.cbc_access import (
    assert_teacher_can_edit,
    require_assessment,
    submit_assessment,
    unlock_assessment,
)
from app.middleware.subscription_guard import require_tenant_with_subscription
from app.services import cbc_service

router = APIRouter()

TenantCtx = Annotated[
    tuple[uuid.UUID, dict[str, Any]],
    Depends(require_tenant_with_subscription),
]


def actor_id(actor: dict[str, Any]) -> uuid.UUID:
    return uuid.UUID(str(actor.get("user_db_id") or actor["sub"]))


# -------------------------------------------------------------------
# Models
# -------------------------------------------------------------------

class AssessmentCreate(BaseModel):
    classId: uuid.UUID
    subjectId: uuid.UUID
    termId: uuid.UUID
    title: str = Field(min_length=1)
    assessmentType: str
    assessmentDate: date
    maxScore: float


class AssessmentUpdate(BaseModel):
    title: str
    assessmentType: str
    assessmentDate: date
    maxScore: float


class ScoreItem(BaseModel):
    studentId: uuid.UUID
    score: float
    remarks: str | None = None


class ScoreBatch(BaseModel):
    scores: list[ScoreItem]


# -------------------------------------------------------------------
# Assessments
# -------------------------------------------------------------------

@router.get("/assessments")
async def list_assessments(
    ctx: TenantCtx,
    classId: uuid.UUID | None = Query(None),
    subjectId: uuid.UUID | None = Query(None),
    termId: uuid.UUID | None = Query(None),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, _ = ctx

    rows = await cbc_service.list_assessments(
        conn,
        school_id,
        classId,
        subjectId,
        termId,
    )

    return {"data": [dict(r) for r in rows]}


@router.post("/assessments", status_code=status.HTTP_201_CREATED)
async def create_assessment(
    body: AssessmentCreate,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx

    row = await cbc_service.create_assessment(
        conn,
        school_id=school_id,
        class_id=body.classId,
        subject_id=body.subjectId,
        teacher_id=actor_id(actor),
        term_id=body.termId,
        title=body.title,
        assessment_type=body.assessmentType,
        assessment_date=body.assessmentDate,
        max_score=body.maxScore,
    )

    return dict(row)


@router.patch("/assessments/{assessment_id}")
async def update_assessment(
    assessment_id: uuid.UUID,
    body: AssessmentUpdate,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx

    await assert_teacher_can_edit(
        conn,
        school_id,
        assessment_id,
        actor_id(actor),
    )

    row = await cbc_service.update_assessment(
        conn,
        assessment_id=assessment_id,
        title=body.title,
        assessment_type=body.assessmentType,
        assessment_date=body.assessmentDate,
        max_score=body.maxScore,
    )

    return dict(row)


@router.delete("/assessments/{assessment_id}")
async def delete_assessment(
    assessment_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx

    await assert_teacher_can_edit(
        conn,
        school_id,
        assessment_id,
        actor_id(actor),
    )

    await cbc_service.delete_assessment(conn, assessment_id)

    return {"success": True}


@router.post("/assessments/{assessment_id}/submit")
async def submit(
    assessment_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx

    await assert_teacher_can_edit(
        conn,
        school_id,
        assessment_id,
        actor_id(actor),
    )

    await submit_assessment(
        conn,
        school_id,
        assessment_id,
        actor_id(actor),
    )

    return {"success": True}


@router.post("/assessments/{assessment_id}/unlock")
async def unlock(
    assessment_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx

    await require_assessment(
        conn,
        school_id,
        assessment_id,
    )

    await unlock_assessment(
        conn,
        school_id,
        assessment_id,
        actor_id(actor),
    )

    return {"success": True}


# -------------------------------------------------------------------
# Scores
# -------------------------------------------------------------------

@router.get("/assessments/{assessment_id}/scores")
async def scores(
    assessment_id: uuid.UUID,
    conn: asyncpg.Connection = Depends(get_db),
):
    rows = await cbc_service.list_scores(
        conn,
        assessment_id,
    )

    return {"data": [dict(r) for r in rows]}


@router.put("/assessments/{assessment_id}/scores")
async def save_scores(
    assessment_id: uuid.UUID,
    body: ScoreBatch,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    _, actor = ctx

    for item in body.scores:
        await cbc_service.save_score(
            conn,
            assessment_id=assessment_id,
            student_id=item.studentId,
            score=item.score,
            remarks=item.remarks,
            entered_by=actor_id(actor),
        )

    return {"success": True}