from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field
from uuid import UUID


AssessmentType = Literal[
    "assignment",
    "project",
    "group_work",
    "practical",
    "participation",
    "presentation",
    "test",
]


class CreateAssessmentRequest(BaseModel):
    class_id: UUID
    subject_id: UUID
    term_id: UUID
    title: str = Field(min_length=1, max_length=200)
    assessment_type: AssessmentType
    assessment_date: date
    max_score: Decimal = Field(gt=0)


class AssessmentResponse(BaseModel):
    id: UUID
    class_id: UUID
    subject_id: UUID
    teacher_id: UUID
    term_id: UUID
    title: str
    assessment_type: AssessmentType
    assessment_date: date
    max_score: Decimal
    status: str


class StudentScoreRequest(BaseModel):
    student_id: UUID
    score: Decimal = Field(ge=0)
    remarks: str | None = None


class SubmitScoresRequest(BaseModel):
    scores: list[StudentScoreRequest]


class ScoreResponse(BaseModel):
    student_id: UUID
    score: Decimal
    remarks: str | None = None


class AssessmentDetailsResponse(BaseModel):
    assessment: AssessmentResponse
    scores: list[ScoreResponse]