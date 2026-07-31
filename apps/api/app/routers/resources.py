"""Teaching plans and subject resources API."""

from __future__ import annotations

import uuid
from typing import Annotated, Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator

from app.config import settings
from app.db.pool import get_db
from app.lib.resource_validation import max_plan_bytes, max_resource_bytes, normalize_mime
from app.middleware.subscription_guard import require_tenant_with_subscription
from app.services.resources import teaching_and_resources as svc
from app.services.storage import get_tenant_storage
from app.services.storage.errors import StorageError, StorageValidationError
from app.services.storage.keys import assert_tenant_key

router = APIRouter()

TenantCtx = Annotated[
    tuple[uuid.UUID, dict[str, Any]],
    Depends(require_tenant_with_subscription),
]


def _http_from_exc(exc: Exception) -> HTTPException:
    if isinstance(exc, PermissionError):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": str(exc) or "Forbidden.", "code": "FORBIDDEN"},
        )
    if isinstance(exc, LookupError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": str(exc) or "Not found.", "code": "NOT_FOUND"},
        )
    if isinstance(exc, ValueError):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": str(exc), "code": "VALIDATION_ERROR"},
        )
    if isinstance(exc, RuntimeError) and str(exc) == "UPLOAD_INCOMPLETE":
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "Upload was not found in storage. Please try uploading again.",
                "code": "UPLOAD_INCOMPLETE",
            },
        )
    if isinstance(exc, StorageValidationError):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": exc.message, "code": exc.code},
        )
    if isinstance(exc, StorageError):
        return HTTPException(
            status_code=exc.status,
            detail={"error": exc.message, "code": exc.code},
        )
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail={
            "error": "Something went wrong. Please try again.",
            "code": "SERVER_ERROR",
        },
    )


class TeachingPlanUploadBody(BaseModel):
    class_id: uuid.UUID
    subject_id: uuid.UUID
    term_id: uuid.UUID
    title: str = Field(min_length=1, max_length=300)
    description: str | None = Field(default=None, max_length=2000)
    filename: str = Field(min_length=1, max_length=255)
    file_size: int = Field(gt=0)
    file_type: str = Field(min_length=1, max_length=120)

    @field_validator("title")
    @classmethod
    def title_strip(cls, v: str) -> str:
        text = (v or "").strip()
        if not text:
            raise ValueError("Title is required")
        return text


class SubjectResourceUploadBody(BaseModel):
    class_id: uuid.UUID
    subject_id: uuid.UUID
    term_id: uuid.UUID | None = None
    title: str = Field(min_length=1, max_length=300)
    description: str | None = Field(default=None, max_length=2000)
    filename: str = Field(min_length=1, max_length=255)
    file_size: int = Field(gt=0)
    file_type: str = Field(min_length=1, max_length=120)

    @field_validator("title")
    @classmethod
    def title_strip(cls, v: str) -> str:
        text = (v or "").strip()
        if not text:
            raise ValueError("Title is required")
        return text


class PatchTeachingPlanBody(BaseModel):
    title: str | None = Field(default=None, max_length=300)
    description: str | None = Field(default=None, max_length=2000)


class PatchSubjectResourceBody(BaseModel):
    title: str | None = Field(default=None, max_length=300)
    description: str | None = Field(default=None, max_length=2000)
    sort_order: int | None = None


class VisibilityBody(BaseModel):
    is_published: bool


class ReorderBody(BaseModel):
    resource_ids: list[uuid.UUID] = Field(min_length=1)


# ── Shared helpers ──────────────────────────────────────────────────────────


@router.get("/terms")
async def list_current_year_terms(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    """Terms for the current academic year — available to staff and learners."""
    school_id, _actor = ctx
    from app.lib.terms import sync_term_current_flags, term_is_current_by_dates

    await sync_term_current_flags(conn, school_id)
    year = await conn.fetchrow(
        """
        SELECT id FROM academic_years
        WHERE school_id = $1 AND is_current = true
        ORDER BY created_at DESC
        LIMIT 1
        """,
        school_id,
    )
    if not year:
        return {"data": []}
    rows = await conn.fetch(
        """
        SELECT id, name, start_date, end_date, is_current
        FROM terms
        WHERE school_id = $1 AND academic_year_id = $2
        ORDER BY start_date NULLS LAST, name
        """,
        school_id,
        year["id"],
    )
    return {
        "data": [
            {
                "id": str(r["id"]),
                "name": r["name"],
                "startDate": r["start_date"].isoformat() if r["start_date"] else None,
                "endDate": r["end_date"].isoformat() if r["end_date"] else None,
                "isCurrent": term_is_current_by_dates(r["start_date"], r["end_date"])
                or bool(r["is_current"]),
            }
            for r in rows
        ]
    }


# ── Local upload bridge ─────────────────────────────────────────────────────


@router.put("/local-upload")
async def local_upload(
    request: Request,
    ctx: TenantCtx,
    key: str = Query(...),
):
    """Dev/local storage: accept PUT body for a tenant key."""
    if not settings.use_local_storage:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "Local upload is only available when STORAGE_BACKEND=local.",
                "code": "NOT_FOUND",
            },
        )

    school_id, _actor = ctx
    try:
        normalized = assert_tenant_key(school_id, key)
    except StorageError as exc:
        raise _http_from_exc(exc) from exc

    content_type = normalize_mime(
        request.headers.get("content-type") or "application/octet-stream"
    )
    data = await request.body()
    if not data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "Empty upload body.", "code": "VALIDATION_ERROR"},
        )

    # Allow up to the larger video limit for local bridge; feature validators already ran
    max_bytes = max(max_plan_bytes(), max_resource_bytes(content_type))
    try:
        await get_tenant_storage().upload_bytes_to_key(
            school_id,
            normalized,
            data,
            content_type=content_type,
            max_bytes=max_bytes,
        )
    except Exception as exc:
        raise _http_from_exc(exc) from exc

    return {"data": {"key": normalized, "size": len(data)}}


# ── Teaching plans ──────────────────────────────────────────────────────────


@router.post("/teaching-plans/upload-url")
async def teaching_plan_upload_url(
    body: TeachingPlanUploadBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        data = await svc.request_teaching_plan_upload(
            conn,
            school_id,
            actor,
            class_id=body.class_id,
            subject_id=body.subject_id,
            term_id=body.term_id,
            title=body.title,
            description=body.description,
            filename=body.filename,
            file_size=body.file_size,
            file_type=body.file_type,
        )
        return {"data": data}
    except Exception as exc:
        raise _http_from_exc(exc) from exc


@router.post("/teaching-plans/{plan_id}/confirm")
async def teaching_plan_confirm(
    plan_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        data = await svc.confirm_teaching_plan(conn, school_id, actor, plan_id)
        return {"data": data}
    except Exception as exc:
        raise _http_from_exc(exc) from exc


@router.get("/teaching-plans/compliance")
async def teaching_plan_compliance(
    ctx: TenantCtx,
    term_id: uuid.UUID = Query(...),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        data = await svc.teaching_plan_compliance(conn, school_id, actor, term_id)
        return {"data": data}
    except Exception as exc:
        raise _http_from_exc(exc) from exc


@router.get("/teaching-plans")
async def teaching_plans_list(
    ctx: TenantCtx,
    class_id: uuid.UUID | None = Query(None),
    term_id: uuid.UUID | None = Query(None),
    teacher_id: uuid.UUID | None = Query(None),
    subject_id: uuid.UUID | None = Query(None),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        data = await svc.list_teaching_plans(
            conn,
            school_id,
            actor,
            class_id=class_id,
            term_id=term_id,
            teacher_id=teacher_id,
            subject_id=subject_id,
        )
        return {"data": data}
    except Exception as exc:
        raise _http_from_exc(exc) from exc


@router.get("/teaching-plans/{plan_id}/download-url")
async def teaching_plan_download(
    plan_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        data = await svc.teaching_plan_download_url(conn, school_id, actor, plan_id)
        return {"data": data}
    except Exception as exc:
        raise _http_from_exc(exc) from exc


@router.patch("/teaching-plans/{plan_id}")
async def teaching_plan_patch(
    plan_id: uuid.UUID,
    body: PatchTeachingPlanBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        data = await svc.patch_teaching_plan(
            conn,
            school_id,
            actor,
            plan_id,
            title=body.title,
            description=body.description,
        )
        return {"data": data}
    except Exception as exc:
        raise _http_from_exc(exc) from exc


@router.delete("/teaching-plans/{plan_id}")
async def teaching_plan_delete(
    plan_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await svc.delete_teaching_plan(conn, school_id, actor, plan_id)
        return {"data": {"id": str(plan_id), "status": "deleted"}}
    except Exception as exc:
        raise _http_from_exc(exc) from exc


# ── Subject resources ───────────────────────────────────────────────────────


@router.post("/subject-resources/upload-url")
async def subject_resource_upload_url(
    body: SubjectResourceUploadBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        data = await svc.request_subject_resource_upload(
            conn,
            school_id,
            actor,
            class_id=body.class_id,
            subject_id=body.subject_id,
            term_id=body.term_id,
            title=body.title,
            description=body.description,
            filename=body.filename,
            file_size=body.file_size,
            file_type=body.file_type,
        )
        return {"data": data}
    except Exception as exc:
        raise _http_from_exc(exc) from exc


@router.post("/subject-resources/{resource_id}/confirm")
async def subject_resource_confirm(
    resource_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        data = await svc.confirm_subject_resource(conn, school_id, actor, resource_id)
        return {"data": data}
    except Exception as exc:
        raise _http_from_exc(exc) from exc


@router.get("/subject-resources")
async def subject_resources_list(
    ctx: TenantCtx,
    class_id: uuid.UUID | None = Query(None),
    subject_id: uuid.UUID | None = Query(None),
    term_id: uuid.UUID | None = Query(None),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        data = await svc.list_subject_resources(
            conn,
            school_id,
            actor,
            class_id=class_id,
            subject_id=subject_id,
            term_id=term_id,
        )
        return {"data": data}
    except Exception as exc:
        raise _http_from_exc(exc) from exc


@router.get("/subject-resources/{resource_id}/download-url")
async def subject_resource_download(
    resource_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        data = await svc.subject_resource_download_url(
            conn, school_id, actor, resource_id
        )
        return {"data": data}
    except Exception as exc:
        raise _http_from_exc(exc) from exc


@router.patch("/subject-resources/{resource_id}")
async def subject_resource_patch(
    resource_id: uuid.UUID,
    body: PatchSubjectResourceBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        data = await svc.patch_subject_resource(
            conn,
            school_id,
            actor,
            resource_id,
            title=body.title,
            description=body.description,
            sort_order=body.sort_order,
        )
        return {"data": data}
    except Exception as exc:
        raise _http_from_exc(exc) from exc


@router.patch("/subject-resources/{resource_id}/visibility")
async def subject_resource_visibility(
    resource_id: uuid.UUID,
    body: VisibilityBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        data = await svc.set_resource_visibility(
            conn, school_id, actor, resource_id, body.is_published
        )
        return {"data": data}
    except Exception as exc:
        raise _http_from_exc(exc) from exc


@router.put("/subject-resources/reorder")
async def subject_resources_reorder(
    body: ReorderBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        data = await svc.reorder_subject_resources(
            conn, school_id, actor, body.resource_ids
        )
        return {"data": data}
    except Exception as exc:
        raise _http_from_exc(exc) from exc


@router.delete("/subject-resources/{resource_id}")
async def subject_resource_delete(
    resource_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    try:
        await svc.delete_subject_resource(conn, school_id, actor, resource_id)
        return {"data": {"id": str(resource_id), "status": "deleted"}}
    except Exception as exc:
        raise _http_from_exc(exc) from exc
