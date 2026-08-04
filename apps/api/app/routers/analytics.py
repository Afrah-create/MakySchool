from __future__ import annotations

import uuid
from typing import Annotated, Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.encoders import jsonable_encoder

from app.db.pool import get_db
from app.lib.analytics.fees import build_fees_analytics
from app.lib.analytics.matviews import (
    fetch_annual_summary,
    fetch_class_trends,
    fetch_subject_trends,
    refresh_analytics_matviews,
)
from app.lib.analytics.overview import build_overview, build_subjects_stub
from app.lib.permissions import can
from app.middleware.subscription_guard import require_tenant_with_subscription

router = APIRouter()

Ctx = Annotated[tuple[Any, dict[str, Any]], Depends(require_tenant_with_subscription)]


def _require_analytics(user: dict[str, Any]) -> None:
    if not can(user.get("role", ""), "viewAnalytics"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "You do not have permission to view analytics.",
                "code": "FORBIDDEN",
            },
        )


@router.get("/overview")
async def analytics_overview(
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_analytics(user)
    data = await build_overview(conn, school_id)
    return {"data": jsonable_encoder(data)}


@router.get("/fees")
async def analytics_fees(
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_analytics(user)
    if not can(user.get("role", ""), "viewFees"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "You do not have permission to view fee analytics.",
                "code": "FORBIDDEN",
            },
        )
    data = await build_fees_analytics(conn, school_id)
    return {"data": jsonable_encoder(data)}


@router.get("/subjects")
async def analytics_subjects(
    ctx: Ctx,
):
    _school_id, user = ctx
    _require_analytics(user)
    data = await build_subjects_stub()
    return {"data": jsonable_encoder(data)}


@router.get("/annual-summary")
async def analytics_annual_summary(
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
):
    """Multi-year school trends from mv_school_annual_summary."""
    school_id, user = ctx
    _require_analytics(user)
    try:
        data = await fetch_annual_summary(conn, school_id)
    except asyncpg.UndefinedTableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "Analytics views are not ready yet. Try again after migrations.",
                "code": "MATVIEW_MISSING",
            },
        ) from exc
    return {"data": data}


@router.get("/class-trends")
async def analytics_class_trends(
    ctx: Ctx,
    academic_year_id: uuid.UUID | None = Query(None, alias="academicYearId"),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_analytics(user)
    try:
        data = await fetch_class_trends(
            conn, school_id, academic_year_id=academic_year_id
        )
    except asyncpg.UndefinedTableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "Analytics views are not ready yet. Try again after migrations.",
                "code": "MATVIEW_MISSING",
            },
        ) from exc
    return {"data": data}


@router.get("/subject-trends")
async def analytics_subject_trends(
    ctx: Ctx,
    academic_year_id: uuid.UUID | None = Query(None, alias="academicYearId"),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, user = ctx
    _require_analytics(user)
    try:
        data = await fetch_subject_trends(
            conn, school_id, academic_year_id=academic_year_id
        )
    except asyncpg.UndefinedTableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "Analytics views are not ready yet. Try again after migrations.",
                "code": "MATVIEW_MISSING",
            },
        ) from exc
    return {"data": data}


@router.post("/refresh")
async def analytics_refresh(
    ctx: Ctx,
    conn: asyncpg.Connection = Depends(get_db),
):
    """Admin-triggered matview refresh (concurrent when possible)."""
    _school_id, user = ctx
    if not can(user.get("role", ""), "manageAcademicYear"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "Only the school admin can refresh analytics caches.",
                "code": "FORBIDDEN",
            },
        )
    try:
        result = await refresh_analytics_matviews(conn, concurrently=True)
    except Exception:
        try:
            result = await refresh_analytics_matviews(conn, concurrently=False)
            result["fallback"] = "non_concurrent"
        except Exception as inner:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={
                    "error": "Analytics refresh failed. Please try again.",
                    "code": "REFRESH_FAILED",
                },
            ) from inner
    return {"data": result}
