from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


AssessmentType = Literal[
    "assignment",
    "project",
    "group_work",
    "practical",
    "participation",
    "presentation",
    "test",
]


AssessmentStatus = Literal[
    "draft",
    "submitted",
]


class CreateAssessmentRequest(BaseModel):
    class_id: UUID
    subject_id: UUID
    teacher_id: UUID
    term_id: UUID

    title: str = Field(min_length=2, max_length=150)

    assessment_type: AssessmentType

    assessment_date: date

    max_score: Decimal = Field(gt=0)


class UpdateAssessmentRequest(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=150)

    assessment_type: AssessmentType | None = None

    assessment_date: date | None = None

    max_score: Decimal | None = Field(default=None, gt=0)


class AssessmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID

    school_id: UUID

    class_id: UUID

    subject_id: UUID

    teacher_id: UUID

    term_id: UUID

    title: str

    assessment_type: AssessmentType

    assessment_date: date

    max_score: Decimal

    status: AssessmentStatus

    submitted_at: datetime | None = None

    unlocked_at: datetime | None = None

    created_at: datetime

    updated_at: datetime


class EnterScoreRequest(BaseModel):
    student_id: UUID

    score: Decimal = Field(ge=0)

    remarks: str | None = Field(default=None, max_length=500)

    entered_by: UUID


class AssessmentScoreResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID

    assessment_id: UUID

    student_id: UUID

    score: Decimal

    remarks: str | None = None

    entered_by: UUID | None = None

    created_at: datetime

    updated_at: datetime