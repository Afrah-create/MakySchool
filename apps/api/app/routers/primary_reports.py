"""Primary school reports API — gated by school_type primary|both."""

from __future__ import annotations

import uuid
from typing import Annotated, Any, Literal

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, field_validator

from app.db.pool import get_db
from app.lib.primary_access import (
    actor_user_id,
    assert_primary_enabled,
    require_primary_action,
)
from app.lib.primary_reports import BULK_MARKS_LIMIT, PLE_GRADE_POINTS
from app.middleware.subscription_guard import require_tenant_with_subscription
from app.services.primary import exams as exams_svc
from app.services.primary import marks as marks_svc
from app.services.primary import ple as ple_svc
from app.services.primary import results as results_svc
from app.services.primary import setup as setup_svc
from app.services.primary import sittings as sittings_svc
from app.services.primary import subjects as subjects_svc

router = APIRouter()

TenantCtx = Annotated[
    tuple[uuid.UUID, dict[str, Any]],
    Depends(require_tenant_with_subscription),
]


def _http(exc: Exception) -> HTTPException:
    if isinstance(exc, HTTPException):
        return exc
    if isinstance(exc, PermissionError):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": str(exc), "code": "FORBIDDEN"},
        )
    if isinstance(exc, LookupError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": str(exc), "code": "NOT_FOUND"},
        )
    if isinstance(exc, ValueError):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"error": str(exc), "code": "VALIDATION_ERROR"},
        )
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail={"error": "Something went wrong. Please try again.", "code": "SERVER_ERROR"},
    )


async def _gate(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor: dict[str, Any],
    action: str,
) -> None:
    await assert_primary_enabled(conn, school_id)
    require_primary_action(actor, action)


# ── Bodies ───────────────────────────────────────────────────────────────────


class SetupBody(BaseModel):
    ca_weight: float = Field(default=30, ge=0, le=100)
    exam_weight: float = Field(default=70, ge=0, le=100)
    allow_thematic_in_p4: bool = False


class SetupPatchBody(BaseModel):
    ca_weight: float | None = Field(default=None, ge=0, le=100)
    exam_weight: float | None = Field(default=None, ge=0, le=100)
    allow_thematic_in_p4: bool | None = None
    aggregate_mode: Literal["ple_points", "percent"] | None = None
    grade_scale: list[dict[str, Any]] | None = None


class SubjectBody(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    code: str = Field(min_length=1, max_length=20)
    subject_type: Literal["core", "elective", "thematic"] = "core"
    applies_from: str = "P4"
    applies_to: str = "P7"
    religion_type: Literal["CRE", "IRE"] | None = None
    max_mark: float = 100
    is_ple_subject: bool = False
    display_order: int = 100


class SubjectPatchBody(BaseModel):
    name: str | None = None
    subject_type: Literal["core", "elective", "thematic"] | None = None
    applies_from: str | None = None
    applies_to: str | None = None
    religion_type: Literal["CRE", "IRE"] | None = None
    max_mark: float | None = None
    is_ple_subject: bool | None = None
    display_order: int | None = None
    is_active: bool | None = None


class LinkClassBody(BaseModel):
    class_id: uuid.UUID
    subject_id: uuid.UUID
    teacher_id: uuid.UUID | None = None
    max_mark: float | None = None


class MarkItem(BaseModel):
    student_id: uuid.UUID
    score: float | None = None


class BulkCaBody(BaseModel):
    class_id: uuid.UUID
    subject_id: uuid.UUID
    ca_title: str = Field(min_length=1, max_length=200)
    ca_type: Literal["assignment", "test", "project", "quiz", "practical"]
    max_score: float = Field(gt=0)
    term_id: uuid.UUID
    marks: list[MarkItem] = Field(min_length=1, max_length=BULK_MARKS_LIMIT)


class BulkExamBody(BaseModel):
    class_id: uuid.UUID
    subject_id: uuid.UUID
    exam_type: Literal["mid_term", "end_of_term", "mock", "internal", "ple_mock"]
    max_score: float = Field(default=100, gt=0)
    term_id: uuid.UUID
    marks: list[MarkItem] = Field(min_length=1, max_length=BULK_MARKS_LIMIT)


class SubmitExamBody(BaseModel):
    class_id: uuid.UUID
    subject_id: uuid.UUID
    term_id: uuid.UUID
    exam_type: Literal["mid_term", "end_of_term", "mock", "internal", "ple_mock"] = "end_of_term"


class ThematicItem(BaseModel):
    student_id: uuid.UUID
    level: int = Field(ge=1, le=4)
    teacher_comment: str | None = None


class BulkThematicBody(BaseModel):
    class_id: uuid.UUID
    theme_id: uuid.UUID
    strand: str = Field(min_length=1, max_length=100)
    term_id: uuid.UUID
    sitting_id: uuid.UUID | None = None
    assessments: list[ThematicItem] = Field(min_length=1, max_length=BULK_MARKS_LIMIT)


class ThematicSheetItem(BaseModel):
    student_id: uuid.UUID
    theme_id: uuid.UUID
    strand: str = Field(min_length=1, max_length=100)
    level: int = Field(ge=1, le=4)
    teacher_comment: str | None = Field(default=None, max_length=500)


class BulkThematicSheetBody(BaseModel):
    class_id: uuid.UUID
    term_id: uuid.UUID
    sitting_id: uuid.UUID
    assessments: list[ThematicSheetItem] = Field(min_length=1, max_length=2500)


class ThemeBody(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    applies_from: str = "P1"
    applies_to: str = "P3"
    display_order: int = 0


class ThemePatchBody(BaseModel):
    name: str | None = None
    applies_from: str | None = None
    applies_to: str | None = None
    display_order: int | None = None
    is_active: bool | None = None


class StrandBody(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    display_order: int = 0


class StrandPatchBody(BaseModel):
    name: str | None = None
    display_order: int | None = None
    is_active: bool | None = None


class SittingCreateBody(BaseModel):
    class_id: uuid.UUID
    term_id: uuid.UUID
    exam_type_id: uuid.UUID
    name: str | None = None
    notes: str | None = None
    open_now: bool = False


class SittingPatchBody(BaseModel):
    name: str | None = None
    notes: str | None = None


class CommentItem(BaseModel):
    student_id: uuid.UUID
    term_id: uuid.UUID
    exam_id: uuid.UUID | None = None
    class_teacher_comment: str | None = None
    head_teacher_comment: str | None = None


class CommentsBody(BaseModel):
    comments: list[CommentItem] = Field(min_length=1, max_length=BULK_MARKS_LIMIT)


class ReportCommentBody(BaseModel):
    classTeacherComment: str | None = None
    headTeacherComment: str | None = None
    approve: bool = False


class BulkReportCommentBody(BaseModel):
    examId: uuid.UUID | None = None
    sittingId: uuid.UUID | None = None
    studentIds: list[uuid.UUID] = Field(min_length=1, max_length=BULK_MARKS_LIMIT)
    classTeacherComment: str | None = None
    headTeacherComment: str | None = None
    approve: bool = False


class PositionsBody(BaseModel):
    class_id: uuid.UUID
    term_id: uuid.UUID


class PleBody(BaseModel):
    student_id: uuid.UUID
    academic_year_id: uuid.UUID
    index_number: str | None = None
    english_grade: str
    math_grade: str
    science_grade: str
    sst_grade: str

    @field_validator("english_grade", "math_grade", "science_grade", "sst_grade")
    @classmethod
    def grade_ok(cls, v: str) -> str:
        key = (v or "").strip().upper()
        if key not in PLE_GRADE_POINTS:
            raise ValueError("PLE grade must be one of D1–F9.")
        return key


class BulkPleBody(BaseModel):
    rows: list[PleBody] = Field(min_length=1, max_length=BULK_MARKS_LIMIT)


# ── Overview / setup ─────────────────────────────────────────────────────────


@router.get("/overview")
async def overview(
    ctx: TenantCtx,
    term_id: uuid.UUID | None = Query(None),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "viewPrimaryResults")
        data = await results_svc.overview_stats(conn, school_id, term_id=term_id)
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/setup")
async def get_setup(ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "viewPrimaryResults")
        data = await setup_svc.get_setup(conn, school_id)
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/setup")
async def post_setup(
    body: SetupBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePrimarySetup")
        async with conn.transaction():
            data = await setup_svc.ensure_setup(
                conn,
                school_id,
                ca_weight=body.ca_weight,
                exam_weight=body.exam_weight,
                allow_thematic_in_p4=body.allow_thematic_in_p4,
            )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.patch("/setup")
async def patch_setup(
    body: SetupPatchBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePrimarySetup")
        async with conn.transaction():
            data = await setup_svc.update_setup(
                conn,
                school_id,
                ca_weight=body.ca_weight,
                exam_weight=body.exam_weight,
                allow_thematic_in_p4=body.allow_thematic_in_p4,
                aggregate_mode=body.aggregate_mode,
                grade_scale=body.grade_scale,
            )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


# ── Catalog ──────────────────────────────────────────────────────────────────


@router.get("/classes")
async def primary_classes(ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)):
    school_id, actor = ctx
    try:
        await assert_primary_enabled(conn, school_id)
        role = (actor.get("role") or "").lower()
        if role == "teacher":
            require_primary_action(actor, "enterPrimaryMarks")
        else:
            require_primary_action(actor, "viewPrimaryResults")
        return {"data": await subjects_svc.list_primary_classes(conn, school_id)}
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/classes/{class_id}/roster")
async def class_roster(
    class_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await assert_primary_enabled(conn, school_id)
        role = (actor.get("role") or "").lower()
        if role == "teacher":
            require_primary_action(actor, "enterPrimaryMarks")
        else:
            require_primary_action(actor, "viewPrimaryResults")
        return {"data": await subjects_svc.list_class_roster(conn, school_id, class_id)}
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/subjects")
async def list_subjects(
    ctx: TenantCtx,
    class_level: str | None = Query(None),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await assert_primary_enabled(conn, school_id)
        role = (actor.get("role") or "").lower()
        if role == "teacher":
            require_primary_action(actor, "enterPrimaryMarks")
        else:
            require_primary_action(actor, "viewPrimaryResults")
        return {
            "data": await subjects_svc.list_subjects(
                conn, school_id, class_level=class_level
            )
        }
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/subjects/install-defaults")
async def install_default_subjects(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePrimarySetup")
        async with conn.transaction():
            data = await subjects_svc.install_default_subjects(conn, school_id)
            await exams_svc.ensure_default_exam_types(conn, school_id)
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/subjects")
async def create_subject(
    body: SubjectBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePrimarySetup")
        data = await subjects_svc.create_subject(conn, school_id, body.model_dump())
        return {"data": data}
    except asyncpg.UniqueViolationError as exc:
        raise _http(ValueError("A subject with this code already exists.")) from exc
    except Exception as exc:
        raise _http(exc) from exc


@router.patch("/subjects/{subject_id}")
async def patch_subject(
    subject_id: uuid.UUID,
    body: SubjectPatchBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePrimarySetup")
        data = await subjects_svc.update_subject(
            conn, school_id, subject_id, body.model_dump(exclude_unset=True)
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.delete("/subjects/{subject_id}")
async def delete_subject(
    subject_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePrimarySetup")
        await subjects_svc.soft_delete_subject(conn, school_id, subject_id)
        return {"data": {"id": str(subject_id), "status": "deleted"}}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/subjects/link-class")
async def link_class(
    body: LinkClassBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePrimarySetup")
        data = await subjects_svc.link_class_subject(
            conn,
            school_id,
            class_id=body.class_id,
            subject_id=body.subject_id,
            teacher_id=body.teacher_id,
            max_mark=body.max_mark,
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/themes")
async def list_themes(
    ctx: TenantCtx,
    class_level: str | None = Query(None),
    include_inactive: bool = Query(False),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "enterPrimaryMarks")
        strands = await subjects_svc.list_strands(
            conn, school_id, include_inactive=include_inactive
        )
        return {
            "data": {
                "themes": await subjects_svc.list_themes(
                    conn,
                    school_id,
                    class_level=class_level,
                    include_inactive=include_inactive,
                ),
                "strands": [s["name"] for s in strands if s["isActive"] or include_inactive],
                "strandItems": strands,
            }
        }
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/themes")
async def create_theme(
    body: ThemeBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePrimarySetup")
        data = await subjects_svc.create_theme(
            conn,
            school_id,
            name=body.name,
            applies_from=body.applies_from,
            applies_to=body.applies_to,
            display_order=body.display_order,
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.patch("/themes/{theme_id}")
async def patch_theme(
    theme_id: uuid.UUID,
    body: ThemePatchBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePrimarySetup")
        data = await subjects_svc.update_theme(
            conn, school_id, theme_id, body.model_dump(exclude_unset=True)
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.delete("/themes/{theme_id}")
async def delete_theme(
    theme_id: uuid.UUID,
    ctx: TenantCtx,
    hard: bool = Query(False),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePrimarySetup")
        await subjects_svc.delete_theme(conn, school_id, theme_id, hard=hard)
        return {"data": {"ok": True}}
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/strands")
async def list_strands_route(
    ctx: TenantCtx,
    include_inactive: bool = Query(False),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "enterPrimaryMarks")
        data = await subjects_svc.list_strands(
            conn, school_id, include_inactive=include_inactive
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/strands")
async def create_strand(
    body: StrandBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePrimarySetup")
        data = await subjects_svc.create_strand(
            conn, school_id, name=body.name, display_order=body.display_order
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.patch("/strands/{strand_id}")
async def patch_strand(
    strand_id: uuid.UUID,
    body: StrandPatchBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePrimarySetup")
        data = await subjects_svc.update_strand(
            conn, school_id, strand_id, body.model_dump(exclude_unset=True)
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.delete("/strands/{strand_id}")
async def delete_strand(
    strand_id: uuid.UUID,
    ctx: TenantCtx,
    hard: bool = Query(False),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePrimarySetup")
        await subjects_svc.delete_strand(conn, school_id, strand_id, hard=hard)
        return {"data": {"ok": True}}
    except Exception as exc:
        raise _http(exc) from exc


# ── Marks ────────────────────────────────────────────────────────────────────


@router.get("/marks/ca")
async def get_ca(
    ctx: TenantCtx,
    class_id: uuid.UUID = Query(...),
    subject_id: uuid.UUID = Query(...),
    term_id: uuid.UUID = Query(...),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "enterPrimaryMarks")
        data = await marks_svc.list_ca(
            conn, school_id, class_id=class_id, subject_id=subject_id, term_id=term_id
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/marks/ca/bulk")
async def bulk_ca(
    body: BulkCaBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "enterPrimaryMarks")
        async with conn.transaction():
            data = await marks_svc.bulk_upsert_ca(
                conn,
                school_id,
                actor_user_id(actor),
                class_id=body.class_id,
                subject_id=body.subject_id,
                ca_title=body.ca_title,
                ca_type=body.ca_type,
                max_score=body.max_score,
                term_id=body.term_id,
                marks=[m.model_dump() for m in body.marks],
            )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/marks/exams")
async def get_exams(
    ctx: TenantCtx,
    class_id: uuid.UUID = Query(...),
    subject_id: uuid.UUID = Query(...),
    term_id: uuid.UUID = Query(...),
    exam_type: str | None = Query(None),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "enterPrimaryMarks")
        data = await marks_svc.list_exams(
            conn,
            school_id,
            class_id=class_id,
            subject_id=subject_id,
            term_id=term_id,
            exam_type=exam_type,
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/marks/exams/bulk")
async def bulk_exams(
    body: BulkExamBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    """Deprecated: use POST /exams/{id}/grades/bulk (teacher-only, exam instances)."""
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail={
            "error": (
                "Legacy exam mark entry is retired. Admins create/open an exam; "
                "teachers enter marks under Primary → Grades."
            ),
            "code": "USE_EXAM_GRADES",
        },
    )


@router.post("/marks/exams/submit")
async def submit_exams(
    body: SubmitExamBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "enterPrimaryMarks")
        data = await marks_svc.submit_exams(
            conn,
            school_id,
            class_id=body.class_id,
            subject_id=body.subject_id,
            term_id=body.term_id,
            exam_type=body.exam_type,
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/marks/exams/unlock")
async def unlock_exams(
    body: SubmitExamBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePrimarySetup")
        data = await marks_svc.unlock_exams(
            conn,
            school_id,
            class_id=body.class_id,
            subject_id=body.subject_id,
            term_id=body.term_id,
            exam_type=body.exam_type,
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/marks/thematic")
async def get_thematic(
    ctx: TenantCtx,
    class_id: uuid.UUID = Query(...),
    term_id: uuid.UUID = Query(...),
    sitting_id: uuid.UUID | None = Query(None),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "enterPrimaryMarks")
        data = await marks_svc.list_thematic(
            conn,
            school_id,
            class_id=class_id,
            term_id=term_id,
            sitting_id=sitting_id,
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/marks/thematic/bulk")
async def bulk_thematic(
    body: BulkThematicBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "enterPrimaryMarks")
        async with conn.transaction():
            data = await marks_svc.bulk_upsert_thematic(
                conn,
                school_id,
                actor_user_id(actor),
                class_id=body.class_id,
                theme_id=body.theme_id,
                strand=body.strand,
                term_id=body.term_id,
                sitting_id=body.sitting_id,
                assessments=[a.model_dump() for a in body.assessments],
            )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/marks/thematic/sheet")
async def bulk_thematic_sheet(
    body: BulkThematicSheetBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    """Teacher sheet save: many theme×strand cells (levels + comments) in one request."""
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "enterPrimaryMarks")
        async with conn.transaction():
            data = await marks_svc.bulk_upsert_thematic_sheet(
                conn,
                school_id,
                actor_user_id(actor),
                class_id=body.class_id,
                term_id=body.term_id,
                sitting_id=body.sitting_id,
                assessments=[a.model_dump() for a in body.assessments],
            )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/marks/thematic/submit")
async def submit_thematic(
    ctx: TenantCtx,
    sitting_id: uuid.UUID = Query(...),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "enterPrimaryMarks")
        data = await sittings_svc.submit_sitting_assessments(
            conn, school_id, sitting_id=sitting_id
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/marks/thematic/unlock")
async def unlock_thematic(
    ctx: TenantCtx,
    sitting_id: uuid.UUID = Query(...),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePrimarySetup")
        data = await sittings_svc.unlock_sitting_assessments(
            conn, school_id, sitting_id=sitting_id
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


# ── Results ──────────────────────────────────────────────────────────────────


@router.get("/results/class/{class_id}")
async def results_class(
    class_id: uuid.UUID,
    ctx: TenantCtx,
    term_id: uuid.UUID = Query(...),
    exam_id: uuid.UUID | None = Query(None),
    sitting_id: uuid.UUID | None = Query(None),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "viewPrimaryResults")
        data = await results_svc.class_results(
            conn,
            school_id,
            class_id=class_id,
            term_id=term_id,
            exam_id=exam_id,
            sitting_id=sitting_id,
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/results/student/{student_id}")
async def results_student(
    student_id: uuid.UUID,
    ctx: TenantCtx,
    term_id: uuid.UUID = Query(...),
    exam_id: uuid.UUID | None = Query(None),
    sitting_id: uuid.UUID | None = Query(None),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "viewPrimaryResults")
        data = await results_svc.student_result(
            conn,
            school_id,
            student_id=student_id,
            term_id=term_id,
            exam_id=exam_id,
            sitting_id=sitting_id,
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/results/comments")
async def results_comments(
    body: CommentsBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "viewPrimaryResults")
        data = await results_svc.save_comments(
            conn, school_id, comments=[c.model_dump() for c in body.comments]
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/report-card/{student_id}")
async def get_report_card(
    student_id: uuid.UUID,
    ctx: TenantCtx,
    exam_id: uuid.UUID | None = Query(None),
    sitting_id: uuid.UUID | None = Query(None),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "viewPrimaryResults")
        if sitting_id:
            sitting = await sittings_svc.require_sitting(conn, school_id, sitting_id)
            data = await results_svc.student_result(
                conn,
                school_id,
                student_id=student_id,
                term_id=uuid.UUID(sitting["termId"]),
                sitting_id=sitting_id,
            )
        elif exam_id:
            from app.lib.primary_exam_access import require_exam

            exam = await require_exam(conn, school_id, exam_id)
            data = await results_svc.student_result(
                conn,
                school_id,
                student_id=student_id,
                term_id=uuid.UUID(exam["termId"]),
                exam_id=exam_id,
            )
        else:
            raise ValueError("Provide exam_id or sitting_id.")
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/report-card/{student_id}/comment")
async def save_report_comment(
    student_id: uuid.UUID,
    body: ReportCommentBody,
    ctx: TenantCtx,
    exam_id: uuid.UUID | None = Query(None),
    sitting_id: uuid.UUID | None = Query(None),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "viewPrimaryResults")
        if body.approve and (actor.get("role") or "").lower() not in {
            "head_teacher",
            "admin",
        }:
            raise HTTPException(
                status_code=403,
                detail={"error": "Only the head teacher or admin can approve."},
            )
        if sitting_id:
            data = await results_svc.upsert_sitting_report_comment(
                conn,
                school_id,
                student_id=student_id,
                sitting_id=sitting_id,
                class_teacher_comment=body.classTeacherComment,
                head_teacher_comment=body.headTeacherComment,
                approve=body.approve,
                actor_id=actor_user_id(actor),
            )
        elif exam_id:
            data = await results_svc.upsert_report_comment(
                conn,
                school_id,
                student_id=student_id,
                exam_id=exam_id,
                class_teacher_comment=body.classTeacherComment,
                head_teacher_comment=body.headTeacherComment,
                approve=body.approve,
                actor_id=actor_user_id(actor),
            )
        else:
            raise ValueError("Provide exam_id or sitting_id.")
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/report-cards/comments/bulk")
async def bulk_save_report_comments(
    body: BulkReportCommentBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "viewPrimaryResults")
        if (
            body.classTeacherComment is None
            and body.headTeacherComment is None
            and not body.approve
        ):
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "Provide a class teacher comment, head teacher comment, or approve.",
                    "code": "EMPTY_COMMENT",
                },
            )
        if body.approve and (actor.get("role") or "").lower() not in {
            "head_teacher",
            "admin",
        }:
            raise HTTPException(
                status_code=403,
                detail={"error": "Only the head teacher or admin can approve."},
            )
        if body.sittingId:
            data = await results_svc.bulk_upsert_sitting_report_comments(
                conn,
                school_id,
                sitting_id=body.sittingId,
                student_ids=body.studentIds,
                class_teacher_comment=body.classTeacherComment,
                head_teacher_comment=body.headTeacherComment,
                approve=body.approve,
                actor_id=actor_user_id(actor),
            )
        elif body.examId:
            data = await results_svc.bulk_upsert_report_comments(
                conn,
                school_id,
                exam_id=body.examId,
                student_ids=body.studentIds,
                class_teacher_comment=body.classTeacherComment,
                head_teacher_comment=body.headTeacherComment,
                approve=body.approve,
                actor_id=actor_user_id(actor),
            )
        else:
            raise ValueError("Provide examId or sittingId.")
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/results/positions")
async def results_positions(
    body: PositionsBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "generatePrimaryReports")
        data = await results_svc.refresh_positions(
            conn, school_id, class_id=body.class_id, term_id=body.term_id
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


# ── PLE ──────────────────────────────────────────────────────────────────────


@router.get("/ple")
async def get_ple(
    ctx: TenantCtx,
    academic_year_id: uuid.UUID = Query(...),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePLEResults")
        data = await ple_svc.list_ple(conn, school_id, academic_year_id)
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/ple")
async def post_ple(
    body: PleBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePLEResults")
        data = await ple_svc.upsert_ple(
            conn, school_id, actor_user_id(actor), body.model_dump()
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/ple/bulk")
async def post_ple_bulk(
    body: BulkPleBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePLEResults")
        async with conn.transaction():
            data = await ple_svc.bulk_upsert_ple(
                conn,
                school_id,
                actor_user_id(actor),
                [r.model_dump() for r in body.rows],
            )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/ple/analytics")
async def get_ple_analytics(
    ctx: TenantCtx,
    academic_year_id: uuid.UUID = Query(...),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePLEResults")
        data = await ple_svc.ple_analytics(conn, school_id, academic_year_id)
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


# ── Report cards (PDF) ───────────────────────────────────────────────────────


@router.post("/report-cards/generate")
async def generate_primary_report_cards(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    exam_id: uuid.UUID | None = Query(None),
    sitting_id: uuid.UUID | None = Query(None),
    class_id: uuid.UUID | None = Query(None),
    term_id: uuid.UUID | None = Query(None),
    student_id: uuid.UUID | None = Query(None),
):
    """Generate primary PDF report card(s). Single PDF or ZIP for the class.

    Prefer exam_id (upper) or sitting_id (lower). class_id + term_id remain for legacy.
    """
    import asyncio
    import io
    import logging
    import zipfile

    from app.db.pool import get_pool
    from app.lib.alevel_reports import load_school_branding
    from app.lib.primary_exam_access import require_exam
    from app.lib.primary_pdf import generate_primary_report_pdf_bytes
    from app.lib.storage_urls import resolve_storage_data_uri

    log = logging.getLogger(__name__)
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "generatePrimaryReports")

        resolved_exam_id = exam_id
        resolved_sitting_id = sitting_id
        if resolved_sitting_id:
            sitting = await sittings_svc.require_sitting(
                conn, school_id, resolved_sitting_id
            )
            class_id = uuid.UUID(sitting["classId"])
            term_id = uuid.UUID(sitting["termId"])
        elif resolved_exam_id:
            exam = await require_exam(conn, school_id, resolved_exam_id)
            class_id = uuid.UUID(exam["classId"])
            term_id = uuid.UUID(exam["termId"])
        elif not class_id or not term_id:
            raise ValueError(
                "Provide exam_id, sitting_id, or both class_id and term_id."
            )

        branding = await load_school_branding(conn, school_id, for_pdf=True)

        if student_id:
            targets = [student_id]
        else:
            rows = await conn.fetch(
                """
                SELECT id FROM students
                WHERE school_id = $1 AND current_class_id = $2 AND status = 'active'
                ORDER BY full_name
                """,
                school_id,
                class_id,
            )
            targets = [r["id"] for r in rows]

        if not targets:
            raise LookupError("No students found for report cards.")

        sem = asyncio.Semaphore(min(4, max(1, len(targets))))
        pool = await get_pool()

        async def one(sid: uuid.UUID) -> tuple[str, bytes]:
            async with sem:
                async with pool.acquire() as worker:
                    try:
                        data = await results_svc.student_result(
                            worker,
                            school_id,
                            student_id=sid,
                            term_id=term_id,  # type: ignore[arg-type]
                            exam_id=resolved_exam_id,
                            sitting_id=resolved_sitting_id,
                        )
                        data["schoolName"] = branding.get("schoolName")
                        data["schoolAddress"] = branding.get("schoolAddress")
                        data["schoolPhone"] = branding.get("schoolPhone")
                        data["schoolEmail"] = branding.get("schoolEmail")

                        # Only embed data URIs — WeasyPrint must not fetch remote URLs.
                        logo = branding.get("logoUrl")
                        stamp = branding.get("stampUrl")
                        if logo and not str(logo).startswith("data:"):
                            logo = await resolve_storage_data_uri(
                                logo, school_id=school_id
                            )
                        if stamp and not str(stamp).startswith("data:"):
                            stamp = await resolve_storage_data_uri(
                                stamp, school_id=school_id
                            )
                        data["logoUrl"] = (
                            logo if logo and str(logo).startswith("data:") else None
                        )
                        data["stampUrl"] = (
                            stamp if stamp and str(stamp).startswith("data:") else None
                        )

                        photo_key = (data.get("student") or {}).get("photoUrl")
                        photo_uri = None
                        if photo_key:
                            if str(photo_key).startswith("data:"):
                                photo_uri = photo_key
                            else:
                                try:
                                    photo_uri = await resolve_storage_data_uri(
                                        photo_key, school_id=school_id
                                    )
                                except Exception:
                                    log.exception(
                                        "primary report photo embed failed student=%s",
                                        sid,
                                    )
                                    photo_uri = None
                            if not photo_uri:
                                log.warning(
                                    "primary report photo missing student=%s stored=%s",
                                    sid,
                                    str(photo_key)[:120],
                                )
                        data["photoUrl"] = photo_uri
                        if data.get("student"):
                            data["student"]["photoUrl"] = photo_uri

                        pdf = await generate_primary_report_pdf_bytes(data)
                        if resolved_sitting_id:
                            await worker.execute(
                                """
                                UPDATE primary_term_results
                                SET report_generated = true,
                                    report_generated_at = COALESCE(report_generated_at, NOW()),
                                    calculated_at = NOW()
                                WHERE school_id = $1 AND student_id = $2 AND sitting_id = $3
                                """,
                                school_id,
                                sid,
                                resolved_sitting_id,
                            )
                        elif resolved_exam_id:
                            await worker.execute(
                                """
                                UPDATE primary_term_results
                                SET report_generated = true,
                                    report_generated_at = COALESCE(report_generated_at, NOW()),
                                    calculated_at = NOW()
                                WHERE school_id = $1 AND student_id = $2 AND exam_id = $3
                                """,
                                school_id,
                                sid,
                                resolved_exam_id,
                            )
                        else:
                            await worker.execute(
                                """
                                UPDATE primary_term_results
                                SET report_generated = true,
                                    report_generated_at = COALESCE(report_generated_at, NOW()),
                                    calculated_at = NOW()
                                WHERE school_id = $1 AND student_id = $2 AND term_id = $3
                                """,
                                school_id,
                                sid,
                                term_id,
                            )
                        learner = (data.get("student") or {}).get("learnerId") or str(sid)
                        safe = "".join(
                            c if c.isalnum() or c in "-_" else "_" for c in str(learner)
                        )
                        name = f"{safe}-{str(sid)[:8]}-primary-report.pdf"
                        return name, pdf
                    except Exception as exc:
                        log.exception(
                            "primary report PDF failed student=%s class=%s term=%s",
                            sid,
                            class_id,
                            term_id,
                        )
                        raise ValueError(
                            f"Could not generate report for student {sid}: {exc}"
                        ) from exc

        generated = await asyncio.gather(*[one(s) for s in targets])

        if len(generated) == 1:
            name, pdf = generated[0]
            return Response(
                content=pdf,
                media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="{name}"'},
            )

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for name, pdf in generated:
                zf.writestr(name, pdf)
        payload = buf.getvalue()
        return Response(
            content=payload,
            media_type="application/zip",
            headers={
                "Content-Disposition": 'attachment; filename="primary-report-cards.zip"',
                "Content-Length": str(len(payload)),
                "Cache-Control": "no-store",
            },
        )
    except Exception as exc:
        raise _http(exc) from exc


# ── Exam types & exams (A-Level-aligned) ─────────────────────────────────────


class ExamTypeBody(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    code: str = Field(min_length=1, max_length=20)
    sort_order: int = 0


class ExamTypePatchBody(BaseModel):
    name: str | None = None
    code: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class ExamCreateBody(BaseModel):
    class_id: uuid.UUID
    term_id: uuid.UUID
    exam_type_id: uuid.UUID
    name: str | None = None
    notes: str | None = None
    open_now: bool = False
    subject_ids: list[uuid.UUID] | None = None


class ExamPatchBody(BaseModel):
    name: str | None = None
    notes: str | None = None
    subject_ids: list[uuid.UUID] | None = None


class ExamGradeItem(BaseModel):
    student_id: uuid.UUID
    subject_id: uuid.UUID
    score: float | None = None
    max_score: float = Field(default=100, gt=0)


class ExamGradesBulkBody(BaseModel):
    marks: list[ExamGradeItem] = Field(min_length=1, max_length=BULK_MARKS_LIMIT)


def _require_teacher(actor: dict[str, Any]) -> None:
    if (actor.get("role") or "").lower() != "teacher":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "Only teachers can enter or submit primary exam marks.",
                "code": "TEACHER_ONLY",
            },
        )


# ── Thematic sittings (P1–P3) ────────────────────────────────────────────────


@router.get("/sittings")
async def list_sittings(
    ctx: TenantCtx,
    class_id: uuid.UUID | None = Query(None),
    term_id: uuid.UUID | None = Query(None),
    status: str | None = Query(None),
    include_deleted: bool = Query(False),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        role = (actor.get("role") or "").lower()
        action = "enterPrimaryMarks" if role == "teacher" else "viewPrimaryResults"
        await _gate(conn, school_id, actor, action)
        data = await sittings_svc.list_sittings(
            conn,
            school_id,
            class_id=class_id,
            term_id=term_id,
            status=status,
            include_deleted=include_deleted and role in {"admin", "head_teacher"},
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/sittings")
async def create_sitting(
    body: SittingCreateBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePrimarySetup")
        data = await sittings_svc.create_sitting(
            conn,
            school_id,
            actor_user_id(actor),
            class_id=body.class_id,
            term_id=body.term_id,
            exam_type_id=body.exam_type_id,
            name=body.name,
            notes=body.notes,
            open_now=body.open_now,
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.patch("/sittings/{sitting_id}")
async def patch_sitting(
    sitting_id: uuid.UUID,
    body: SittingPatchBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePrimarySetup")
        from app.services.primary.sittings import _UNSET

        data = await sittings_svc.update_sitting(
            conn,
            school_id,
            sitting_id,
            name=body.name,
            notes=body.notes if "notes" in body.model_fields_set else _UNSET,
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/sittings/{sitting_id}/open")
async def open_sitting(
    sitting_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "viewPrimaryResults")
        data = await sittings_svc.open_sitting(
            conn, school_id, sitting_id, actor_user_id(actor)
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/sittings/{sitting_id}/close")
async def close_sitting(
    sitting_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "viewPrimaryResults")
        data = await sittings_svc.close_sitting(
            conn, school_id, sitting_id, actor_user_id(actor)
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/sittings/{sitting_id}/restore")
async def restore_sitting(
    sitting_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePrimarySetup")
        data = await sittings_svc.restore_sitting(conn, school_id, sitting_id)
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.delete("/sittings/{sitting_id}")
async def delete_sitting(
    sitting_id: uuid.UUID,
    ctx: TenantCtx,
    hard: bool = Query(False),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePrimarySetup")
        if hard:
            await sittings_svc.hard_delete_sitting(conn, school_id, sitting_id)
            return {"data": {"ok": True}}
        data = await sittings_svc.soft_delete_sitting(
            conn, school_id, sitting_id, actor_user_id(actor)
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/exam-types")
async def get_exam_types(
    ctx: TenantCtx,
    active_only: bool = Query(False),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "viewPrimaryResults")
        await exams_svc.ensure_default_exam_types(conn, school_id)
        data = await exams_svc.list_exam_types(
            conn, school_id, active_only=active_only
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/exam-types")
async def post_exam_type(
    body: ExamTypeBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePrimarySetup")
        data = await exams_svc.create_exam_type(
            conn,
            school_id,
            name=body.name,
            code=body.code,
            sort_order=body.sort_order,
        )
        return {"data": data}
    except asyncpg.UniqueViolationError as exc:
        raise _http(ValueError("Exam type code or name already exists.")) from exc
    except Exception as exc:
        raise _http(exc) from exc


@router.patch("/exam-types/{exam_type_id}")
async def patch_exam_type(
    exam_type_id: uuid.UUID,
    body: ExamTypePatchBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePrimarySetup")
        data = await exams_svc.update_exam_type(
            conn, school_id, exam_type_id, body.model_dump(exclude_unset=True)
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.delete("/exam-types/{exam_type_id}")
async def delete_exam_type(
    exam_type_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePrimarySetup")
        await exams_svc.delete_exam_type(conn, school_id, exam_type_id)
        return {"data": {"ok": True}}
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/exams")
async def get_exams(
    ctx: TenantCtx,
    class_id: uuid.UUID | None = Query(None),
    term_id: uuid.UUID | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    include_deleted: bool = Query(False),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await assert_primary_enabled(conn, school_id)
        role = (actor.get("role") or "").lower()
        if status_filter and status_filter not in ("draft", "open", "closed"):
            raise ValueError("status must be draft, open, or closed.")
        if role == "teacher":
            require_primary_action(actor, "enterPrimaryMarks")
            data = await exams_svc.list_exams(
                conn,
                school_id,
                class_id=class_id,
                term_id=term_id,
                status=status_filter,
                include_deleted=False,
                teacher_id=actor_user_id(actor),
            )
        else:
            require_primary_action(actor, "viewPrimaryResults")
            if include_deleted:
                require_primary_action(actor, "managePrimarySetup")
            data = await exams_svc.list_exams(
                conn,
                school_id,
                class_id=class_id,
                term_id=term_id,
                status=status_filter,
                include_deleted=include_deleted,
            )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/exams")
async def post_exam(
    body: ExamCreateBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePrimarySetup")
        async with conn.transaction():
            data = await exams_svc.create_exam(
                conn,
                school_id,
                actor_user_id(actor),
                class_id=body.class_id,
                term_id=body.term_id,
                exam_type_id=body.exam_type_id,
                name=body.name,
                notes=body.notes,
                open_now=body.open_now,
                subject_ids=body.subject_ids,
            )
        return {"data": data}
    except asyncpg.UniqueViolationError as exc:
        raise _http(
            ValueError("An exam of this type already exists for this class and term.")
        ) from exc
    except Exception as exc:
        raise _http(exc) from exc


@router.patch("/exams/{exam_id}")
async def patch_exam(
    exam_id: uuid.UUID,
    body: ExamPatchBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePrimarySetup")
        payload = body.model_dump(exclude_unset=True)
        kwargs: dict[str, Any] = {}
        if "name" in payload:
            kwargs["name"] = payload["name"]
        if "notes" in payload:
            kwargs["notes"] = payload["notes"]
        if "subject_ids" in payload:
            kwargs["subject_ids"] = payload["subject_ids"]
        async with conn.transaction():
            data = await exams_svc.update_exam(conn, school_id, exam_id, **kwargs)
        return {"data": data}
    except asyncpg.UniqueViolationError as exc:
        raise _http(
            ValueError("An exam of this type already exists for this class and term.")
        ) from exc
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/exams/{exam_id}/open")
async def open_exam(
    exam_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "viewPrimaryResults")
        data = await exams_svc.open_exam(
            conn, school_id, exam_id, actor_user_id(actor)
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/exams/{exam_id}/close")
async def close_exam(
    exam_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "viewPrimaryResults")
        data = await exams_svc.close_exam(
            conn, school_id, exam_id, actor_user_id(actor)
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/exams/{exam_id}/restore")
async def restore_exam(
    exam_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePrimarySetup")
        data = await exams_svc.restore_exam(conn, school_id, exam_id)
        return {"data": data}
    except asyncpg.UniqueViolationError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "An active exam of this type already exists for this class and term.",
                "code": "DUPLICATE",
            },
        ) from exc
    except Exception as exc:
        raise _http(exc) from exc


@router.delete("/exams/{exam_id}")
async def delete_exam(
    exam_id: uuid.UUID,
    ctx: TenantCtx,
    hard: bool = Query(False),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "managePrimarySetup")
        if hard:
            await exams_svc.hard_delete_exam(conn, school_id, exam_id)
            return {"data": {"ok": True, "hard": True}}
        data = await exams_svc.soft_delete_exam(
            conn, school_id, exam_id, actor_user_id(actor)
        )
        return {"data": {"ok": True, "hard": False, "exam": data}}
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/exams/{exam_id}/grades")
async def get_exam_grades(
    exam_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await assert_primary_enabled(conn, school_id)
        role = (actor.get("role") or "").lower()
        is_teacher = role == "teacher"
        if is_teacher:
            require_primary_action(actor, "enterPrimaryMarks")
            data = await exams_svc.get_exam_grades_grid(
                conn,
                school_id,
                exam_id,
                teacher_id=actor_user_id(actor),
                is_teacher=True,
            )
        else:
            require_primary_action(actor, "viewPrimaryResults")
            data = await exams_svc.get_exam_grades_grid(
                conn, school_id, exam_id, is_teacher=False
            )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/exams/{exam_id}/grades/bulk")
async def bulk_exam_grades(
    exam_id: uuid.UUID,
    body: ExamGradesBulkBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await assert_primary_enabled(conn, school_id)
        _require_teacher(actor)
        require_primary_action(actor, "enterPrimaryMarks")
        async with conn.transaction():
            data = await exams_svc.bulk_save_exam_marks(
                conn,
                school_id,
                actor_user_id(actor),
                exam_id=exam_id,
                marks=[m.model_dump() for m in body.marks],
            )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/exams/{exam_id}/submit")
async def submit_exam_grades(
    exam_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await assert_primary_enabled(conn, school_id)
        _require_teacher(actor)
        require_primary_action(actor, "enterPrimaryMarks")
        async with conn.transaction():
            data = await exams_svc.submit_exam_marks(
                conn, school_id, actor_user_id(actor), exam_id
            )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/exams/{exam_id}/submissions")
async def get_exam_submissions(
    exam_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "viewPrimaryResults")
        from app.lib.primary_exam_access import list_exam_submissions

        data = await list_exam_submissions(conn, school_id, exam_id)
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.post("/exams/{exam_id}/submissions/{teacher_id}/unlock")
async def unlock_exam_submission(
    exam_id: uuid.UUID,
    teacher_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "viewPrimaryResults")
        data = await exams_svc.unlock_teacher_submission(
            conn, school_id, exam_id, teacher_id
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc

