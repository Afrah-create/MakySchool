import uuid
from typing import Annotated, Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.db.pool import get_db
from app.lib.permissions import can
from app.lib.teacher_assignments import AssignmentInput, scaffold_term_submissions
from app.lib.teaching_load import (
    apply_slot_updates,
    apply_teacher_load,
    fetch_teaching_load_matrix,
)
from app.middleware.subscription_guard import require_tenant_with_subscription

router = APIRouter()

TenantCtx = Annotated[tuple[uuid.UUID, dict[str, Any]], Depends(require_tenant_with_subscription)]


class SlotUpdateBody(BaseModel):
    class_id: uuid.UUID
    subject_id: uuid.UUID
    teacher_id: uuid.UUID | None = None


class PatchSlotsBody(BaseModel):
    slots: list[SlotUpdateBody] = Field(default_factory=list)
    acknowledge_assignment_warnings: bool = False


class TeacherAssignmentBody(BaseModel):
    class_id: uuid.UUID
    subject_id: uuid.UUID


class PatchTeacherLoadBody(BaseModel):
    assignments: list[TeacherAssignmentBody] = Field(default_factory=list)
    acknowledge_assignment_warnings: bool = False


def _staff_guard(actor: dict[str, Any]) -> None:
    if not can(actor["role"], "manageStaff"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "You do not have permission to manage teaching assignments.",
                "code": "FORBIDDEN",
            },
        )


def _sync_error_response(result: dict[str, Any]) -> None:
    code = result.get("code", "SERVER_ERROR")
    status_code = status.HTTP_409_CONFLICT if code != "VALIDATION_ERROR" else status.HTTP_422_UNPROCESSABLE_ENTITY
    raise HTTPException(
        status_code=status_code,
        detail={
            "error": result.get("error", "Could not update teaching load."),
            "code": code,
            "fields": result.get("fields"),
            "preview": result.get("preview"),
        },
    )


@router.get("")
async def get_teaching_load(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    _staff_guard(actor)
    matrix = await fetch_teaching_load_matrix(conn, school_id)
    return {"data": matrix}


@router.patch("/slots")
async def patch_teaching_slots(
    body: PatchSlotsBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    _staff_guard(actor)
    actor_id = uuid.UUID(str(actor["sub"]))

    updates = [
        {
            "class_id": str(item.class_id),
            "subject_id": str(item.subject_id),
            "teacher_id": str(item.teacher_id) if item.teacher_id else None,
        }
        for item in body.slots
    ]

    try:
        async with conn.transaction():
            result = await apply_slot_updates(
                conn,
                school_id,
                actor_id,
                updates,
                acknowledge_warnings=body.acknowledge_assignment_warnings,
            )
            if not result["ok"]:
                _sync_error_response(result)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "Something went wrong. Please try again.",
                "code": "SERVER_ERROR",
            },
        )

    matrix = await fetch_teaching_load_matrix(conn, school_id)
    return {"data": matrix}


@router.patch("/teachers/{teacher_id}")
async def patch_teacher_load(
    teacher_id: uuid.UUID,
    body: PatchTeacherLoadBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    _staff_guard(actor)
    actor_id = uuid.UUID(str(actor["sub"]))

    exists = await conn.fetchval(
        """
        SELECT id FROM users
        WHERE id = $1 AND school_id = $2 AND LOWER(role) = 'teacher'
        LIMIT 1
        """,
        teacher_id,
        school_id,
    )
    if not exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "Teacher not found in your school.", "code": "NOT_FOUND"},
        )

    assignments = [
        AssignmentInput(class_id=item.class_id, subject_id=item.subject_id)
        for item in body.assignments
    ]

    try:
        async with conn.transaction():
            result = await apply_teacher_load(
                conn,
                school_id,
                teacher_id,
                actor_id,
                assignments,
                acknowledge_warnings=body.acknowledge_assignment_warnings,
            )
            if not result["ok"]:
                _sync_error_response(result)

            preview = result.get("preview") or {}
            to_add = preview.get("to_add") or []
            if to_add:
                await scaffold_term_submissions(
                    conn,
                    school_id,
                    teacher_id,
                    [
                        AssignmentInput(
                            class_id=uuid.UUID(item["class_id"]),
                            subject_id=uuid.UUID(item["subject_id"])
                            if item.get("subject_id")
                            else None,
                        )
                        for item in to_add
                    ],
                )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "Something went wrong. Please try again.",
                "code": "SERVER_ERROR",
            },
        )

    matrix = await fetch_teaching_load_matrix(conn, school_id)
    return {"data": matrix}
