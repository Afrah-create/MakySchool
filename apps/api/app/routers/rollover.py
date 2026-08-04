"""Year-end rollover API — admin only; separate primary/secondary tracks."""

from __future__ import annotations

import uuid
from typing import Annotated, Any, Literal

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.db.pool import get_db
from app.lib.permissions import can
from app.middleware.subscription_guard import require_tenant_with_subscription
from app.services.rollover.execute import (
    RolloverExecuteError,
    execute_rollover,
    list_rollover_history,
)
from app.services.rollover.previews import (
    build_fee_structure_preview,
    build_teacher_assignment_preview,
    build_timetable_preview,
)
from app.services.rollover.promotion_preview import (
    PromotionPreviewError,
    build_promotion_preview,
)
from app.services.rollover.sessions import (
    RolloverSessionError,
    cancel_session,
    get_session,
    list_in_progress_sessions,
    patch_session,
    start_session,
)

router = APIRouter()

TenantCtx = Annotated[tuple[uuid.UUID, dict[str, Any]], Depends(require_tenant_with_subscription)]

RolloverTrackParam = Literal["primary", "secondary"]


class StartSessionBody(BaseModel):
    track: RolloverTrackParam
    fromAcademicYearId: uuid.UUID | None = None


class PatchSessionBody(BaseModel):
    currentStep: int | None = Field(default=None, ge=1, le=6)
    draft: dict[str, Any] | None = None


class ExecuteBody(BaseModel):
    idempotencyKey: str | None = Field(default=None, max_length=128)


def _require_admin_rollover(actor: dict[str, Any]) -> None:
    if not can(actor["role"], "manageAcademicYear"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "Only the school admin can run academic year rollover.",
                "code": "FORBIDDEN",
            },
        )


def _actor_id(actor: dict[str, Any]) -> uuid.UUID:
    return uuid.UUID(str(actor["sub"]))


def _http_from_session(exc: RolloverSessionError) -> HTTPException:
    code = status.HTTP_404_NOT_FOUND if exc.code == "NOT_FOUND" else status.HTTP_400_BAD_REQUEST
    return HTTPException(status_code=code, detail={"error": exc.message, "code": exc.code})


@router.get("/sessions")
async def list_sessions(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    _require_admin_rollover(actor)
    return {"data": await list_in_progress_sessions(conn, school_id)}


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def create_session(
    body: StartSessionBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    _require_admin_rollover(actor)
    try:
        async with conn.transaction():
            data = await start_session(
                conn,
                school_id,
                track=body.track,
                actor_id=_actor_id(actor),
                from_academic_year_id=body.fromAcademicYearId,
            )
    except RolloverSessionError as exc:
        raise _http_from_session(exc) from exc
    return {"data": data}


@router.get("/sessions/{session_id}")
async def read_session(
    session_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    _require_admin_rollover(actor)
    try:
        data = await get_session(conn, school_id, session_id)
    except RolloverSessionError as exc:
        raise _http_from_session(exc) from exc
    return {"data": data}


@router.patch("/sessions/{session_id}")
async def update_session(
    session_id: uuid.UUID,
    body: PatchSessionBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    _require_admin_rollover(actor)
    try:
        async with conn.transaction():
            data = await patch_session(
                conn,
                school_id,
                session_id,
                current_step=body.currentStep,
                draft_patch=body.draft,
            )
    except RolloverSessionError as exc:
        raise _http_from_session(exc) from exc
    return {"data": data}


@router.post("/sessions/{session_id}/cancel")
async def cancel_rollover_session(
    session_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    _require_admin_rollover(actor)
    try:
        async with conn.transaction():
            data = await cancel_session(conn, school_id, session_id)
    except RolloverSessionError as exc:
        raise _http_from_session(exc) from exc
    return {"data": data}


@router.post("/sessions/{session_id}/execute")
async def execute_session(
    session_id: uuid.UUID,
    body: ExecuteBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    _require_admin_rollover(actor)
    try:
        async with conn.transaction():
            data = await execute_rollover(
                conn,
                school_id,
                session_id=session_id,
                actor_id=_actor_id(actor),
                idempotency_key=body.idempotencyKey,
            )
    except RolloverExecuteError as exc:
        code = (
            status.HTTP_404_NOT_FOUND
            if exc.code == "NOT_FOUND"
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(
            status_code=code,
            detail={"error": exc.message, "code": exc.code},
        ) from exc
    except PromotionPreviewError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": exc.message, "code": exc.code},
        ) from exc
    return {"data": data}


@router.get("/promotion-preview")
async def promotion_preview(
    ctx: TenantCtx,
    track: RolloverTrackParam = Query(...),
    from_academic_year_id: uuid.UUID | None = Query(None, alias="fromAcademicYearId"),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    _require_admin_rollover(actor)
    try:
        data = await build_promotion_preview(
            conn,
            school_id,
            track=track,
            from_academic_year_id=from_academic_year_id,
        )
    except PromotionPreviewError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": exc.message, "code": exc.code},
        ) from exc
    return {"data": data}


@router.get("/teacher-preview")
async def teacher_preview(
    ctx: TenantCtx,
    track: RolloverTrackParam = Query(...),
    from_academic_year_id: uuid.UUID = Query(..., alias="fromAcademicYearId"),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    _require_admin_rollover(actor)
    data = await build_teacher_assignment_preview(
        conn,
        school_id,
        track=track,
        from_academic_year_id=from_academic_year_id,
    )
    return {"data": data}


@router.get("/fee-preview")
async def fee_preview(
    ctx: TenantCtx,
    track: RolloverTrackParam = Query(...),
    from_academic_year_id: uuid.UUID = Query(..., alias="fromAcademicYearId"),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    _require_admin_rollover(actor)
    try:
        data = await build_fee_structure_preview(
            conn,
            school_id,
            track=track,
            from_academic_year_id=from_academic_year_id,
        )
    except PromotionPreviewError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": exc.message, "code": exc.code},
        ) from exc
    return {"data": data}


@router.get("/timetable-preview")
async def timetable_preview(
    ctx: TenantCtx,
    track: RolloverTrackParam = Query(...),
    from_academic_year_id: uuid.UUID = Query(..., alias="fromAcademicYearId"),
    source_term_id: uuid.UUID | None = Query(None, alias="sourceTermId"),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    _require_admin_rollover(actor)
    try:
        data = await build_timetable_preview(
            conn,
            school_id,
            track=track,
            from_academic_year_id=from_academic_year_id,
            source_term_id=source_term_id,
        )
    except PromotionPreviewError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": exc.message, "code": exc.code},
        ) from exc
    return {"data": data}


@router.get("/history")
async def rollover_history(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    _require_admin_rollover(actor)
    return {"data": await list_rollover_history(conn, school_id)}
