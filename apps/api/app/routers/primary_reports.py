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
from app.services.primary import marks as marks_svc
from app.services.primary import ple as ple_svc
from app.services.primary import results as results_svc
from app.services.primary import setup as setup_svc
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
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
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
    assessments: list[ThematicItem] = Field(min_length=1, max_length=BULK_MARKS_LIMIT)


class CommentItem(BaseModel):
    student_id: uuid.UUID
    term_id: uuid.UUID
    class_teacher_comment: str | None = None
    head_teacher_comment: str | None = None


class CommentsBody(BaseModel):
    comments: list[CommentItem] = Field(min_length=1, max_length=BULK_MARKS_LIMIT)


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
        await _gate(conn, school_id, actor, "enterPrimaryMarks")
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
        await _gate(conn, school_id, actor, "enterPrimaryMarks")
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
        await _gate(conn, school_id, actor, "viewPrimaryResults")
        return {
            "data": await subjects_svc.list_subjects(
                conn, school_id, class_level=class_level
            )
        }
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
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "enterPrimaryMarks")
        return {
            "data": {
                "themes": await subjects_svc.list_themes(
                    conn, school_id, class_level=class_level
                ),
                "strands": subjects_svc.strands(),
            }
        }
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
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "enterPrimaryMarks")
        async with conn.transaction():
            data = await marks_svc.bulk_upsert_exams(
                conn,
                school_id,
                actor_user_id(actor),
                class_id=body.class_id,
                subject_id=body.subject_id,
                exam_type=body.exam_type,
                max_score=body.max_score,
                term_id=body.term_id,
                marks=[m.model_dump() for m in body.marks],
            )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


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
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "enterPrimaryMarks")
        data = await marks_svc.list_thematic(
            conn, school_id, class_id=class_id, term_id=term_id
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
                assessments=[a.model_dump() for a in body.assessments],
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
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "viewPrimaryResults")
        data = await results_svc.class_results(
            conn, school_id, class_id=class_id, term_id=term_id
        )
        return {"data": data}
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/results/student/{student_id}")
async def results_student(
    student_id: uuid.UUID,
    ctx: TenantCtx,
    term_id: uuid.UUID = Query(...),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "viewPrimaryResults")
        data = await results_svc.student_result(
            conn, school_id, student_id=student_id, term_id=term_id
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
    class_id: uuid.UUID = Query(...),
    term_id: uuid.UUID = Query(...),
    student_id: uuid.UUID | None = Query(None),
):
    """Generate primary PDF report card(s). Single PDF or ZIP for the class.

    Bulk class generation uses a bounded semaphore and separate pool connections
    so large classes do not exhaust the DB pool or time out the proxy.
    """
    import asyncio
    import io
    import zipfile

    from app.db.pool import get_pool
    from app.lib.alevel_reports import load_school_branding
    from app.lib.primary_pdf import generate_primary_report_pdf_bytes

    school_id, actor = ctx
    try:
        await _gate(conn, school_id, actor, "generatePrimaryReports")

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
                    data = await results_svc.student_result(
                        worker, school_id, student_id=sid, term_id=term_id
                    )
                    data["schoolName"] = branding.get("schoolName")
                    data["logoUrl"] = branding.get("logoUrl")
                    data["stampUrl"] = branding.get("stampUrl")
                    pdf = await generate_primary_report_pdf_bytes(data)
                    await worker.execute(
                        """
                        UPDATE primary_term_results
                        SET report_generated = true, calculated_at = NOW()
                        WHERE school_id = $1 AND student_id = $2 AND term_id = $3
                        """,
                        school_id,
                        sid,
                        term_id,
                    )
                    learner = (data.get("student") or {}).get("learnerId") or str(sid)
                    safe = str(learner).replace(" ", "_")
                    name = f"{safe}-{str(sid)[:8]}-primary-report.pdf"
                    return name, pdf

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
