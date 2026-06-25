from __future__ import annotations

from typing import Annotated, Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.encoders import jsonable_encoder

from app.db.pool import get_db
from app.lib.analytics.fees import build_fees_analytics
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
