"""O-Level NLSC CBC module — curriculum-driven termly grading for S1–S4."""

from __future__ import annotations

import io
import uuid
import zipfile
from typing import Annotated, Any, Optional

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field

from app.db.pool import get_db
from app.lib.alevel_reports import load_school_branding, student_initials
from app.lib.classes import O_LEVEL_CLASS_LEVELS
from app.lib.olevel_access import (
    assert_olevel_enabled,
    actor_user_id,
    require_olevel_action,
    teacher_assigned_olevel_class_ids,
)
from app.lib.olevel_pdf import generate_olevel_report_pdf_bytes
from app.lib.storage_urls import resolve_storage_data_uri
from app.middleware.subscription_guard import require_tenant_with_subscription
from app.services.olevel import (
    curriculum as curriculum_svc,
    enrollments as enrollments_svc,
    grading as grading_svc,
    marks as marks_svc,
    overview as overview_svc,
    results as results_svc,
    sessions as sessions_svc,
    subjects as subjects_svc,
)

TenantCtx = Annotated[
    tuple[uuid.UUID, dict[str, Any]],
    Depends(require_tenant_with_subscription),
]


async def _require_olevel_school(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
) -> None:
    school_id, _actor = ctx
    await assert_olevel_enabled(conn, school_id)


router = APIRouter(dependencies=[Depends(_require_olevel_school)])


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


def _ok(data: Any, message: str | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {"data": data}
    if message:
        out["message"] = message
    return out


def _http_lookup(exc: LookupError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"error": str(exc) or "Not found.", "code": "NOT_FOUND"},
    )


# ── Overview / classes / terms ────────────────────────────────────────────────


@router.get("/overview")
async def overview(ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)):
    school_id, actor = ctx
    require_olevel_action(actor, "viewCurriculum")
    return _ok(await overview_svc.overview_stats(conn, school_id))


@router.get("/classes")
async def list_classes(ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)):
    school_id, actor = ctx
    role = (actor.get("role") or "").lower()
    require_olevel_action(
        actor, "viewCurriculum" if role != "teacher" else "enterOLevelMarks"
    )
    params: list[Any] = [school_id, list(O_LEVEL_CLASS_LEVELS)]
    teacher_filter = ""
    if role == "teacher":
        class_ids = await teacher_assigned_olevel_class_ids(
            conn, school_id, actor_user_id(actor)
        )
        if not class_ids:
            return _ok([])
        teacher_filter = " AND sc.id = ANY($3::uuid[])"
        params.append(class_ids)
    rows = await conn.fetch(
        f"""
        SELECT sc.id, sc.level, sc.stream,
               CASE WHEN sc.stream IS NULL OR sc.stream = '' THEN sc.level
                    ELSE sc.level || ' ' || sc.stream END AS name
        FROM school_classes sc
        WHERE sc.school_id = $1 AND sc.level = ANY($2::text[])
        {teacher_filter}
        ORDER BY sc.level, sc.stream NULLS FIRST
        """,
        *params,
    )
    return _ok(
        [
            {
                "id": str(r["id"]),
                "level": r["level"],
                "stream": r["stream"],
                "name": r["name"],
            }
            for r in rows
        ]
    )


@router.get("/terms")
async def list_terms(ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)):
    school_id, actor = ctx
    require_olevel_action(actor, "viewCurriculum")
    rows = await conn.fetch(
        """
        SELECT t.id, t.name, t.academic_year_id, ay.year AS academic_year,
               COALESCE(t.is_current, false) AS is_current,
               COALESCE(ay.is_current, false) AS year_is_current,
               t.start_date
        FROM terms t
        JOIN academic_years ay ON ay.id = t.academic_year_id
        WHERE t.school_id = $1
        ORDER BY
          CASE WHEN COALESCE(t.is_current, false) THEN 0 ELSE 1 END,
          CASE WHEN COALESCE(ay.is_current, false) THEN 0 ELSE 1 END,
          ay.year DESC,
          t.start_date DESC NULLS LAST,
          t.name
        """,
        school_id,
    )
    return _ok(
        [
            {
                "id": str(r["id"]),
                "name": r["name"],
                "academicYearId": str(r["academic_year_id"]),
                "academicYearName": str(r["academic_year"]),
                "isCurrent": bool(r["is_current"]),
                "yearIsCurrent": bool(r["year_is_current"]),
                "startDate": r["start_date"].isoformat() if r["start_date"] else None,
            }
            for r in rows
        ]
    )


# ── Curriculum ────────────────────────────────────────────────────────────────


class SetupBody(CamelModel):
    name: str = "Uganda NLSC CBC"
    description: Optional[str] = None
    academic_year_from: int = Field(alias="academicYearFrom")
    seed_defaults: bool = Field(True, alias="seedDefaults")


class PatchCurriculumBody(CamelModel):
    name: Optional[str] = None
    description: Optional[str] = None
    academic_year_from: Optional[int] = Field(None, alias="academicYearFrom")
    academic_year_to: Optional[int] = Field(None, alias="academicYearTo")
    is_active: Optional[bool] = Field(None, alias="isActive")


@router.post("/curriculum/setup")
async def curriculum_setup(
    body: SetupBody, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    require_olevel_action(actor, "manageCurriculum")
    data = await curriculum_svc.setup(
        conn,
        school_id,
        actor_user_id(actor),
        {
            "name": body.name,
            "description": body.description,
            "academic_year_from": body.academic_year_from,
            "seed_defaults": body.seed_defaults,
        },
    )
    return _ok(data, "Curriculum configured.")


@router.get("/curriculum")
async def get_curriculum(ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)):
    school_id, actor = ctx
    # Teachers need the grade scale for live mark-entry feedback.
    role = (actor.get("role") or "").lower()
    if role == "teacher":
        require_olevel_action(actor, "enterOLevelMarks")
    else:
        require_olevel_action(actor, "viewCurriculum")
    return _ok(await curriculum_svc.get_curriculum(conn, school_id))


@router.patch("/curriculum/{curriculum_id}")
async def patch_curriculum(
    curriculum_id: uuid.UUID,
    body: PatchCurriculumBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    require_olevel_action(actor, "manageCurriculum")
    try:
        data = await curriculum_svc.patch_curriculum(
            conn, school_id, curriculum_id, body.model_dump(by_alias=False, exclude_none=True)
        )
    except LookupError as exc:
        raise _http_lookup(exc) from exc
    return _ok(data)


@router.put("/curriculum/{curriculum_id}/grade-scale")
async def put_grade_scale(
    curriculum_id: uuid.UUID,
    body: list[dict[str, Any]],
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    require_olevel_action(actor, "manageCurriculum")
    try:
        data = await curriculum_svc.replace_grade_scale(
            conn, school_id, curriculum_id, body
        )
    except LookupError as exc:
        raise _http_lookup(exc) from exc
    return _ok(data)


@router.put("/curriculum/{curriculum_id}/assessment-categories")
async def put_categories(
    curriculum_id: uuid.UUID,
    body: list[dict[str, Any]],
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    require_olevel_action(actor, "manageCurriculum")
    try:
        data = await curriculum_svc.replace_categories(
            conn, school_id, curriculum_id, body
        )
    except LookupError as exc:
        raise _http_lookup(exc) from exc
    return _ok(data)


@router.put("/curriculum/{curriculum_id}/selection-rules")
async def put_selection_rules(
    curriculum_id: uuid.UUID,
    body: list[dict[str, Any]],
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    require_olevel_action(actor, "manageCurriculum")
    try:
        data = await curriculum_svc.replace_selection_rules(
            conn, school_id, curriculum_id, body
        )
    except LookupError as exc:
        raise _http_lookup(exc) from exc
    return _ok(data)


@router.put("/curriculum/{curriculum_id}/promotion-rules")
async def put_promotion_rules(
    curriculum_id: uuid.UUID,
    body: dict[str, Any],
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    require_olevel_action(actor, "manageCurriculum")
    try:
        data = await curriculum_svc.replace_promotion_rules(
            conn, school_id, curriculum_id, body
        )
    except LookupError as exc:
        raise _http_lookup(exc) from exc
    return _ok(data)


@router.put("/curriculum/{curriculum_id}/report-rules")
async def put_report_rules(
    curriculum_id: uuid.UUID,
    body: dict[str, Any],
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    require_olevel_action(actor, "manageCurriculum")
    try:
        data = await curriculum_svc.replace_report_rules(
            conn, school_id, curriculum_id, body
        )
    except LookupError as exc:
        raise _http_lookup(exc) from exc
    return _ok(data)


# ── Subjects ──────────────────────────────────────────────────────────────────


class SubjectCreateBody(CamelModel):
    name: str
    code: str
    abbreviation: Optional[str] = None
    department: Optional[str] = None


@router.get("/subjects")
async def list_subjects(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    is_active: Optional[bool] = Query(None),
    department: Optional[str] = Query(None),
):
    school_id, actor = ctx
    require_olevel_action(actor, "viewCurriculum")
    return _ok(
        await subjects_svc.list_subjects(
            conn, school_id, is_active=is_active, department=department
        )
    )


@router.post("/subjects")
async def create_subject(
    body: SubjectCreateBody, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    require_olevel_action(actor, "manageCurriculum")
    try:
        data = await subjects_svc.create_subject(
            conn, school_id, body.model_dump(by_alias=False)
        )
    except asyncpg.UniqueViolationError as exc:
        raise HTTPException(
            status_code=409,
            detail={"error": "Subject code already exists.", "code": "DUPLICATE_CODE"},
        ) from exc
    return _ok(data)


@router.patch("/subjects/{subject_id}")
async def patch_subject(
    subject_id: uuid.UUID,
    body: dict[str, Any],
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    require_olevel_action(actor, "manageCurriculum")
    try:
        data = await subjects_svc.patch_subject(conn, school_id, subject_id, body)
    except LookupError as exc:
        raise _http_lookup(exc) from exc
    return _ok(data)


@router.get("/curriculum/{curriculum_id}/subjects")
async def list_curriculum_subjects(
    curriculum_id: uuid.UUID, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    require_olevel_action(actor, "viewCurriculum")
    return _ok(await subjects_svc.list_curriculum_subjects(conn, school_id, curriculum_id))


@router.post("/curriculum/{curriculum_id}/subjects")
async def assign_curriculum_subject(
    curriculum_id: uuid.UUID,
    body: dict[str, Any],
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    require_olevel_action(actor, "manageCurriculum")
    try:
        data = await subjects_svc.assign_curriculum_subject(
            conn, school_id, curriculum_id, body
        )
    except LookupError as exc:
        raise _http_lookup(exc) from exc
    except asyncpg.UniqueViolationError as exc:
        raise HTTPException(
            409, detail={"error": "Subject already assigned.", "code": "DUPLICATE"}
        ) from exc
    return _ok(data)


@router.patch("/curriculum/{curriculum_id}/subjects/{subject_id}")
async def update_curriculum_subject(
    curriculum_id: uuid.UUID,
    subject_id: uuid.UUID,
    body: dict[str, Any],
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    require_olevel_action(actor, "manageCurriculum")
    try:
        data = await subjects_svc.update_curriculum_subject(
            conn, school_id, curriculum_id, subject_id, body
        )
    except LookupError as exc:
        raise _http_lookup(exc) from exc
    return _ok(data)


@router.delete("/curriculum/{curriculum_id}/subjects/{subject_id}")
async def remove_curriculum_subject(
    curriculum_id: uuid.UUID,
    subject_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    require_olevel_action(actor, "manageCurriculum")
    await subjects_svc.remove_curriculum_subject(
        conn, school_id, curriculum_id, subject_id
    )
    return _ok({"removed": True})


@router.put("/curriculum/{curriculum_id}/subjects/band")
async def replace_band_subjects(
    curriculum_id: uuid.UUID,
    body: dict[str, Any],
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    """Replace compulsory/optional assignments for S1–S2 or S3–S4."""
    school_id, actor = ctx
    require_olevel_action(actor, "manageCurriculum")
    levels = body.get("applies_to_levels") or body.get("appliesToLevels") or []
    subjects = body.get("subjects") or []
    if not isinstance(levels, list) or not isinstance(subjects, list):
        raise HTTPException(
            422,
            detail={
                "error": "Expected appliesToLevels and subjects lists.",
                "code": "VALIDATION_ERROR",
            },
        )
    try:
        data = await subjects_svc.replace_band_subjects(
            conn,
            school_id,
            curriculum_id,
            levels=[str(x) for x in levels],
            subjects=subjects,
        )
    except LookupError as exc:
        raise _http_lookup(exc) from exc
    return _ok(data)


# ── Exam sessions ─────────────────────────────────────────────────────────────


@router.get("/exam-sessions")
async def list_exam_sessions(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    class_id: Optional[uuid.UUID] = Query(None),
    term_id: Optional[uuid.UUID] = Query(None),
    academic_year_id: Optional[uuid.UUID] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    include_deleted: bool = Query(False),
):
    school_id, actor = ctx
    role = (actor.get("role") or "").lower()
    require_olevel_action(
        actor, "manageExamSessions" if role != "teacher" else "enterOLevelMarks"
    )
    # Teachers never see soft-deleted sessions.
    show_deleted = include_deleted and role != "teacher"
    data = await sessions_svc.list_sessions(
        conn,
        school_id,
        class_id=class_id,
        term_id=term_id,
        academic_year_id=academic_year_id,
        status=status_filter,
        include_deleted=show_deleted,
    )
    if role == "teacher":
        allowed = set(
            str(x)
            for x in await teacher_assigned_olevel_class_ids(
                conn, school_id, actor_user_id(actor)
            )
        )
        data = [s for s in data if s.get("classId") in allowed]
    return _ok(data)


@router.post("/exam-sessions")
async def create_exam_session(
    body: dict[str, Any], ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    require_olevel_action(actor, "manageExamSessions")
    try:
        data = await sessions_svc.create_session(
            conn, school_id, actor_user_id(actor), body
        )
    except LookupError as exc:
        raise _http_lookup(exc) from exc
    except asyncpg.UniqueViolationError as exc:
        raise HTTPException(
            409,
            detail={
                "error": "An exam session already exists for this class, term, and category.",
                "code": "DUPLICATE_SESSION",
            },
        ) from exc
    return _ok(data)


@router.patch("/exam-sessions/{session_id}")
async def patch_exam_session(
    session_id: uuid.UUID,
    body: dict[str, Any],
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    require_olevel_action(actor, "manageExamSessions")
    return _ok(await sessions_svc.patch_session(conn, school_id, session_id, body))


@router.patch("/exam-sessions/{session_id}/open")
async def open_exam_session(
    session_id: uuid.UUID, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    require_olevel_action(actor, "manageExamSessions")
    try:
        return _ok(await sessions_svc.open_session(conn, school_id, session_id))
    except LookupError as exc:
        raise _http_lookup(exc) from exc


@router.patch("/exam-sessions/{session_id}/close")
async def close_exam_session(
    session_id: uuid.UUID, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    require_olevel_action(actor, "manageExamSessions")
    try:
        return _ok(await sessions_svc.close_session(conn, school_id, session_id))
    except LookupError as exc:
        raise _http_lookup(exc) from exc


@router.post("/exam-sessions/{session_id}/restore")
async def restore_exam_session(
    session_id: uuid.UUID, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    require_olevel_action(actor, "manageExamSessions")
    try:
        return _ok(await sessions_svc.restore_session(conn, school_id, session_id))
    except LookupError as exc:
        raise _http_lookup(exc) from exc


@router.delete("/exam-sessions/{session_id}")
async def delete_exam_session(
    session_id: uuid.UUID,
    ctx: TenantCtx,
    hard: bool = Query(False),
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    require_olevel_action(actor, "manageExamSessions")
    try:
        if hard:
            await sessions_svc.hard_delete_session(conn, school_id, session_id)
            return _ok({"ok": True, "hard": True})
        data = await sessions_svc.soft_delete_session(
            conn, school_id, session_id, actor_user_id(actor)
        )
        return _ok({"ok": True, "hard": False, "session": data})
    except LookupError as exc:
        raise _http_lookup(exc) from exc


# ── Enrollments ───────────────────────────────────────────────────────────────


@router.get("/enrollments")
async def list_enrollments(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    class_id: Optional[uuid.UUID] = Query(None),
    academic_year_id: Optional[uuid.UUID] = Query(None),
):
    school_id, actor = ctx
    require_olevel_action(actor, "manageStudentSubjects")
    return _ok(
        await enrollments_svc.list_enrollments(
            conn, school_id, class_id=class_id, academic_year_id=academic_year_id
        )
    )


@router.post("/enrollments")
async def create_enrollment(
    body: dict[str, Any], ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    require_olevel_action(actor, "manageStudentSubjects")
    payload = {
        "student_id": body.get("student_id") or body.get("studentId"),
        "curriculum_id": body.get("curriculum_id") or body.get("curriculumId"),
        "class_id": body.get("class_id") or body.get("classId"),
        "academic_year_id": body.get("academic_year_id") or body.get("academicYearId"),
    }
    return _ok(
        await enrollments_svc.create_enrollment(
            conn, school_id, actor_user_id(actor), payload
        )
    )


@router.post("/enrollments/bulk")
async def bulk_enroll(
    body: dict[str, Any], ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    require_olevel_action(actor, "manageStudentSubjects")
    return _ok(
        await enrollments_svc.bulk_enroll(
            conn,
            school_id,
            actor_user_id(actor),
            class_id=uuid.UUID(str(body.get("class_id") or body.get("classId"))),
            academic_year_id=uuid.UUID(
                str(body.get("academic_year_id") or body.get("academicYearId"))
            ),
            curriculum_id=uuid.UUID(
                str(body.get("curriculum_id") or body.get("curriculumId"))
            ),
        )
    )


@router.post("/enrollments/bulk-subjects")
async def bulk_register_subjects(
    body: dict[str, Any], ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    require_olevel_action(actor, "manageStudentSubjects")
    raw_ids = body.get("enrollment_ids") or body.get("enrollmentIds") or []
    enrollment_ids: list[uuid.UUID] | None = None
    if isinstance(raw_ids, list) and raw_ids:
        enrollment_ids = [uuid.UUID(str(x)) for x in raw_ids]
    return _ok(
        await enrollments_svc.bulk_register_subjects(
            conn,
            school_id,
            actor_user_id(actor),
            class_id=uuid.UUID(str(body.get("class_id") or body.get("classId"))),
            academic_year_id=uuid.UUID(
                str(body.get("academic_year_id") or body.get("academicYearId"))
            ),
            subjects=body.get("subjects") or [],
            enrollment_ids=enrollment_ids,
        )
    )


@router.post("/enrollments/{enrollment_id}/subjects")
async def register_subjects(
    enrollment_id: uuid.UUID,
    body: dict[str, Any],
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    require_olevel_action(actor, "manageStudentSubjects")
    subjects = body.get("subjects") if isinstance(body.get("subjects"), list) else body
    if not isinstance(subjects, list):
        raise HTTPException(
            422, detail={"error": "Expected a subjects list.", "code": "VALIDATION_ERROR"}
        )
    try:
        return _ok(
            await enrollments_svc.register_subjects(
                conn, school_id, actor_user_id(actor), enrollment_id, subjects
            )
        )
    except LookupError as exc:
        raise _http_lookup(exc) from exc


@router.get("/enrollments/{enrollment_id}/subjects")
async def list_enrollment_subjects(
    enrollment_id: uuid.UUID, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    require_olevel_action(actor, "manageStudentSubjects")
    return _ok(
        await enrollments_svc.list_subject_registrations(conn, school_id, enrollment_id)
    )


@router.delete("/enrollments/{enrollment_id}/subjects/{subject_id}")
async def drop_subject(
    enrollment_id: uuid.UUID,
    subject_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    require_olevel_action(actor, "manageStudentSubjects")
    await enrollments_svc.drop_subject(conn, school_id, enrollment_id, subject_id)
    return _ok({"dropped": True})


# ── Marks ─────────────────────────────────────────────────────────────────────


@router.get("/marks")
async def get_marks(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    exam_session_id: uuid.UUID = Query(...),
    subject_id: uuid.UUID = Query(...),
):
    school_id, actor = ctx
    require_olevel_action(actor, "enterOLevelMarks")
    role = (actor.get("role") or "").lower()
    is_teacher = role == "teacher"
    try:
        data = await marks_svc.get_mark_grid(
            conn,
            school_id,
            actor_user_id(actor) if is_teacher else None,
            exam_session_id=exam_session_id,
            subject_id=subject_id,
            require_assignment=is_teacher,
        )
    except LookupError as exc:
        raise _http_lookup(exc) from exc
    return _ok(data)


@router.post("/marks/bulk")
async def bulk_marks(
    body: dict[str, Any], ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    require_olevel_action(actor, "enterOLevelMarks")
    role = (actor.get("role") or "").lower()
    # Spec: teachers enter marks; admin/HT may also enter for cover.
    is_teacher = role == "teacher"
    return _ok(
        await marks_svc.bulk_save_marks(
            conn,
            school_id,
            actor_user_id(actor),
            exam_session_id=uuid.UUID(
                str(body.get("exam_session_id") or body.get("examSessionId"))
            ),
            subject_id=uuid.UUID(str(body.get("subject_id") or body.get("subjectId"))),
            marks=body.get("marks") or [],
            require_assignment=is_teacher,
        )
    )


@router.post("/marks/{exam_session_id}/submit")
async def submit_marks(
    exam_session_id: uuid.UUID,
    body: dict[str, Any],
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    require_olevel_action(actor, "enterOLevelMarks")
    subject_id = uuid.UUID(str(body.get("subject_id") or body.get("subjectId")))
    return _ok(
        await marks_svc.submit_marks(
            conn,
            school_id,
            actor_user_id(actor),
            exam_session_id=exam_session_id,
            subject_id=subject_id,
        )
    )


@router.post("/marks/{exam_session_id}/unlock")
async def unlock_marks(
    exam_session_id: uuid.UUID,
    body: dict[str, Any],
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    require_olevel_action(actor, "manageExamSessions")
    return _ok(
        await marks_svc.unlock_marks(
            conn,
            school_id,
            actor_user_id(actor),
            exam_session_id=exam_session_id,
            subject_id=uuid.UUID(str(body.get("subject_id") or body.get("subjectId"))),
            teacher_id=uuid.UUID(str(body.get("teacher_id") or body.get("teacherId"))),
            reason=str(body.get("reason") or ""),
        )
    )


@router.get("/marks/{exam_session_id}/submissions")
async def list_submissions(
    exam_session_id: uuid.UUID, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    require_olevel_action(actor, "manageExamSessions")
    rows = await conn.fetch(
        """
        SELECT ms.*, os.name AS subject_name, os.code AS subject_code,
               u.full_name AS teacher_name,
               (SELECT COUNT(*) FROM olevel_marks m
                 WHERE m.exam_session_id = ms.exam_session_id AND m.subject_id = ms.subject_id) AS entered_count
        FROM olevel_mark_submissions ms
        JOIN olevel_subjects os ON os.id = ms.subject_id
        JOIN users u ON u.id = ms.teacher_id
        WHERE ms.school_id = $1 AND ms.exam_session_id = $2
        ORDER BY os.name, u.full_name
        """,
        school_id,
        exam_session_id,
    )
    return _ok(
        [
            {
                "id": str(r["id"]),
                "subjectId": str(r["subject_id"]),
                "subjectName": r["subject_name"],
                "subjectCode": r["subject_code"],
                "teacherId": str(r["teacher_id"]),
                "teacherName": r["teacher_name"],
                "status": r["status"],
                "submittedAt": r["submitted_at"].isoformat() if r["submitted_at"] else None,
                "unlockedAt": r["unlocked_at"].isoformat() if r["unlocked_at"] else None,
                "unlockReason": r["unlock_reason"],
                "enteredCount": int(r["entered_count"] or 0),
            }
            for r in rows
        ]
    )


# ── Grading / results ─────────────────────────────────────────────────────────


@router.post("/grade/class")
async def grade_class(
    body: dict[str, Any], ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    require_olevel_action(actor, "viewOLevelResults")
    class_id = uuid.UUID(str(body.get("class_id") or body.get("classId")))
    term_id = uuid.UUID(str(body.get("term_id") or body.get("termId")))
    academic_year_id = uuid.UUID(
        str(body.get("academic_year_id") or body.get("academicYearId"))
    )
    exam_raw = body.get("exam_session_id") or body.get("examSessionId")
    assess_raw = body.get("assessment_session_ids") or body.get("assessmentSessionIds")
    exam_id, assess_ids, a_code, e_code = await grading_svc.resolve_selection(
        conn,
        school_id,
        class_id=class_id,
        term_id=term_id,
        academic_year_id=academic_year_id,
        exam_session_id=uuid.UUID(str(exam_raw)) if exam_raw else None,
        assessment_session_ids=(
            [uuid.UUID(str(x)) for x in assess_raw]
            if isinstance(assess_raw, list)
            else None
        ),
    )
    return _ok(
        await grading_svc.grade_class(
            conn,
            school_id,
            class_id=class_id,
            term_id=term_id,
            academic_year_id=academic_year_id,
            assessment_session_ids=assess_ids,
            exam_session_id=exam_id,
            assessment_code=a_code,
            exam_code=e_code,
        )
    )


@router.post("/grade/generate")
async def generate_class_results(
    body: dict[str, Any], ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    """Grade the class and recalculate rankings in one step."""
    school_id, actor = ctx
    require_olevel_action(actor, "viewOLevelResults")
    exam_raw = body.get("exam_session_id") or body.get("examSessionId")
    assess_raw = body.get("assessment_session_ids") or body.get("assessmentSessionIds")
    return _ok(
        await grading_svc.generate_class_results(
            conn,
            school_id,
            class_id=uuid.UUID(str(body.get("class_id") or body.get("classId"))),
            term_id=uuid.UUID(str(body.get("term_id") or body.get("termId"))),
            academic_year_id=uuid.UUID(
                str(body.get("academic_year_id") or body.get("academicYearId"))
            ),
            exam_session_id=uuid.UUID(str(exam_raw)) if exam_raw else None,
            assessment_session_ids=(
                [uuid.UUID(str(x)) for x in assess_raw]
                if isinstance(assess_raw, list)
                else None
            ),
            actor_id=actor_user_id(actor),
        )
    )


@router.get("/results/grading-selection")
async def get_grading_selection(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    class_id: uuid.UUID = Query(...),
    term_id: uuid.UUID = Query(...),
    academic_year_id: uuid.UUID = Query(...),
):
    school_id, actor = ctx
    require_olevel_action(actor, "viewOLevelResults")
    data = await grading_svc.get_grading_selection(
        conn,
        school_id,
        class_id=class_id,
        term_id=term_id,
        academic_year_id=academic_year_id,
    )
    return _ok(data)


@router.post("/grade/student/{enrollment_id}")
async def grade_student(
    enrollment_id: uuid.UUID,
    body: dict[str, Any],
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    require_olevel_action(actor, "viewOLevelResults")
    class_id = uuid.UUID(str(body.get("class_id") or body.get("classId")))
    term_id = uuid.UUID(str(body.get("term_id") or body.get("termId")))
    academic_year_id = uuid.UUID(
        str(body.get("academic_year_id") or body.get("academicYearId"))
    )
    exam_raw = body.get("exam_session_id") or body.get("examSessionId")
    assess_raw = body.get("assessment_session_ids") or body.get("assessmentSessionIds")
    try:
        exam_id, assess_ids, a_code, e_code = await grading_svc.resolve_selection(
            conn,
            school_id,
            class_id=class_id,
            term_id=term_id,
            academic_year_id=academic_year_id,
            exam_session_id=uuid.UUID(str(exam_raw)) if exam_raw else None,
            assessment_session_ids=(
                [uuid.UUID(str(x)) for x in assess_raw]
                if isinstance(assess_raw, list)
                else None
            ),
        )
        return _ok(
            await grading_svc.grade_student(
                conn,
                school_id,
                enrollment_id=enrollment_id,
                term_id=term_id,
                academic_year_id=academic_year_id,
                assessment_session_ids=assess_ids,
                exam_session_id=exam_id,
                assessment_code=a_code,
                exam_code=e_code,
            )
        )
    except LookupError as exc:
        raise _http_lookup(exc) from exc


@router.get("/grade/preview/{enrollment_id}")
async def grade_preview(
    enrollment_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    term_id: uuid.UUID = Query(...),
    academic_year_id: uuid.UUID = Query(...),
    class_id: uuid.UUID = Query(...),
):
    school_id, actor = ctx
    require_olevel_action(actor, "viewOLevelResults")
    try:
        return _ok(
            await grading_svc.preview(
                conn,
                school_id,
                enrollment_id=enrollment_id,
                term_id=term_id,
                academic_year_id=academic_year_id,
                class_id=class_id,
            )
        )
    except LookupError as exc:
        raise _http_lookup(exc) from exc


@router.post("/results/rankings")
async def rankings(
    body: dict[str, Any], ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    require_olevel_action(actor, "viewOLevelResults")
    return _ok(
        await grading_svc.recalculate_rankings(
            conn,
            school_id,
            class_id=uuid.UUID(str(body.get("class_id") or body.get("classId"))),
            term_id=uuid.UUID(str(body.get("term_id") or body.get("termId"))),
            academic_year_id=uuid.UUID(
                str(body.get("academic_year_id") or body.get("academicYearId"))
            ),
        )
    )


@router.get("/results/class")
async def class_results(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    class_id: uuid.UUID = Query(...),
    term_id: uuid.UUID = Query(...),
    academic_year_id: uuid.UUID = Query(...),
):
    school_id, actor = ctx
    require_olevel_action(actor, "viewOLevelResults")
    return _ok(
        await results_svc.class_results(
            conn,
            school_id,
            class_id=class_id,
            term_id=term_id,
            academic_year_id=academic_year_id,
        )
    )


@router.get("/results/student/{enrollment_id}")
async def student_results(
    enrollment_id: uuid.UUID, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    require_olevel_action(actor, "viewOLevelResults")
    try:
        return _ok(
            await results_svc.student_results(
                conn, school_id, enrollment_id=enrollment_id
            )
        )
    except LookupError as exc:
        raise _http_lookup(exc) from exc


@router.post("/results/comments")
async def save_comments(
    body: dict[str, Any], ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    require_olevel_action(actor, "viewOLevelResults")
    role = (actor.get("role") or "").lower()
    class_comment = body.get("class_teacher_comment", body.get("classTeacherComment"))
    head_comment = body.get("head_teacher_comment", body.get("headTeacherComment"))
    if head_comment is not None and role not in ("admin", "head_teacher"):
        raise HTTPException(
            403,
            detail={
                "error": "Only head teachers may set head teacher comments.",
                "code": "FORBIDDEN",
            },
        )
    return _ok(
        await results_svc.save_comments(
            conn,
            school_id,
            enrollment_id=uuid.UUID(
                str(body.get("enrollment_id") or body.get("enrollmentId"))
            ),
            term_id=uuid.UUID(str(body.get("term_id") or body.get("termId"))),
            academic_year_id=uuid.UUID(
                str(body.get("academic_year_id") or body.get("academicYearId"))
            ),
            class_teacher_comment=class_comment,
            head_teacher_comment=head_comment,
        )
    )


@router.post("/results/comments/bulk")
async def save_comments_bulk(
    body: dict[str, Any], ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    require_olevel_action(actor, "viewOLevelResults")
    role = (actor.get("role") or "").lower()
    class_comment = body.get("class_teacher_comment", body.get("classTeacherComment"))
    head_comment = body.get("head_teacher_comment", body.get("headTeacherComment"))
    approve = bool(body.get("approve"))
    if head_comment is not None and role not in ("admin", "head_teacher"):
        raise HTTPException(
            403,
            detail={
                "error": "Only head teachers may set head teacher comments.",
                "code": "FORBIDDEN",
            },
        )
    if approve and role not in ("admin", "head_teacher"):
        raise HTTPException(
            403,
            detail={"error": "Only head teachers may approve.", "code": "FORBIDDEN"},
        )
    raw_ids = body.get("enrollment_ids") or body.get("enrollmentIds") or []
    if not isinstance(raw_ids, list) or not raw_ids:
        raise HTTPException(
            422,
            detail={
                "error": "Select at least one student.",
                "code": "VALIDATION_ERROR",
            },
        )
    return _ok(
        await results_svc.save_comments_bulk(
            conn,
            school_id,
            enrollment_ids=[uuid.UUID(str(x)) for x in raw_ids],
            term_id=uuid.UUID(str(body.get("term_id") or body.get("termId"))),
            academic_year_id=uuid.UUID(
                str(body.get("academic_year_id") or body.get("academicYearId"))
            ),
            class_teacher_comment=class_comment,
            head_teacher_comment=head_comment,
            approve=approve,
            actor_id=actor_user_id(actor) if approve else None,
        )
    )


@router.post("/results/approve")
async def approve_results(
    body: dict[str, Any], ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    role = (actor.get("role") or "").lower()
    if role not in ("admin", "head_teacher"):
        raise HTTPException(
            403, detail={"error": "Only head teachers may approve.", "code": "FORBIDDEN"}
        )
    require_olevel_action(actor, "viewOLevelResults")
    return _ok(
        await results_svc.approve(
            conn,
            school_id,
            actor_user_id(actor),
            class_id=uuid.UUID(str(body.get("class_id") or body.get("classId"))),
            term_id=uuid.UUID(str(body.get("term_id") or body.get("termId"))),
            academic_year_id=uuid.UUID(
                str(body.get("academic_year_id") or body.get("academicYearId"))
            ),
        )
    )


# ── Report cards ──────────────────────────────────────────────────────────────


async def _build_report_payload(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    enrollment_id: uuid.UUID,
    term_id: uuid.UUID,
    academic_year_id: uuid.UUID,
) -> dict[str, Any]:
    e = await conn.fetchrow(
        """
        SELECT e.*, s.full_name, s.learner_id, s.photo_url,
               CASE WHEN sc.stream IS NULL OR sc.stream = '' THEN sc.level
                    ELSE sc.level || ' ' || sc.stream END AS class_name,
               t.name AS term_name, ay.year AS academic_year
        FROM student_curriculum_enrollments e
        JOIN students s ON s.id = e.student_id
        LEFT JOIN school_classes sc ON sc.id = e.class_id
        LEFT JOIN terms t ON t.id = $3
        LEFT JOIN academic_years ay ON ay.id = $4
        WHERE e.id = $1 AND e.school_id = $2
        """,
        enrollment_id,
        school_id,
        term_id,
        academic_year_id,
    )
    if not e:
        raise LookupError("Enrollment not found.")
    result = await conn.fetchrow(
        """
        SELECT r.*, u.full_name AS approved_by_name
        FROM olevel_student_results r
        LEFT JOIN users u ON u.id = r.approved_by
        WHERE r.school_id=$1 AND r.enrollment_id=$2 AND r.term_id=$3 AND r.academic_year_id=$4
        """,
        school_id,
        enrollment_id,
        term_id,
        academic_year_id,
    )
    if not result:
        raise HTTPException(
            422,
            detail={
                "error": "Results not yet calculated for this student.",
                "code": "RESULTS_MISSING",
            },
        )
    subjects = await conn.fetch(
        """
        SELECT sr.*, os.name AS subject_name, os.code AS subject_code
        FROM olevel_subject_results sr
        JOIN olevel_subjects os ON os.id = sr.subject_id
        WHERE sr.enrollment_id=$1 AND sr.term_id=$2 AND sr.academic_year_id=$3
        ORDER BY os.name
        """,
        enrollment_id,
        term_id,
        academic_year_id,
    )
    report_rules = await conn.fetchrow(
        "SELECT * FROM curriculum_report_rules WHERE curriculum_id=$1",
        e["curriculum_id"],
    )
    branding = await load_school_branding(conn, school_id, for_pdf=True)
    photo = await resolve_storage_data_uri(e["photo_url"], school_id=school_id)
    name = e["full_name"]
    rules = {
        "showGrades": bool(report_rules["show_grades"]) if report_rules else True,
        "showPercentages": bool(report_rules["show_percentages"]) if report_rules else True,
        "showPoints": bool(report_rules["show_points"]) if report_rules else True,
        "showTeacherComment": bool(report_rules["show_teacher_comment"]) if report_rules else True,
        "showHeadTeacherComment": (
            bool(report_rules["show_head_teacher_comment"]) if report_rules else True
        ),
        "reportTitle": report_rules["report_title"] if report_rules else "PROGRESS REPORT",
        "customFooterText": report_rules["custom_footer_text"] if report_rules else None,
    }
    return {
        "schoolName": branding.get("schoolName") or branding.get("name"),
        "logoUrl": branding.get("logoUrl"),
        "stampUrl": branding.get("stampUrl"),
        "photoUrl": photo,
        "studentName": name,
        "studentInitials": student_initials(name),
        "learnerId": e["learner_id"],
        "className": e["class_name"],
        "termName": e["term_name"],
        "academicYearName": str(e["academic_year"]) if e["academic_year"] is not None else None,
        "classTeacherComment": result["class_teacher_comment"],
        "headTeacherComment": result["head_teacher_comment"],
        "approvedAt": result["approved_at"].isoformat() if result["approved_at"] else None,
        "approvedByName": result["approved_by_name"],
        "reportRules": rules,
        "subjectResults": [
            {
                "subjectName": s["subject_name"],
                "subjectCode": s["subject_code"],
                "assessmentPercent": float(s["assessment_percent"] or 0)
                if s.get("assessment_percent") is not None
                else None,
                "examPercent": float(s["exam_percent"] or 0)
                if s.get("exam_percent") is not None
                else None,
                "weightedScore": float(s["weighted_score"] or 0),
                "grade": s["grade"],
                "gradeLabel": s.get("grade_label"),
                "points": float(s["points"] or 0),
            }
            for s in subjects
        ],
        "totals": {
            "totalPoints": float(result["total_points"] or 0),
            "averagePercent": float(result["average_percent"] or 0),
            "classPosition": result["class_position"],
            "totalStudentsInClass": result["total_students_in_class"],
            "isPromoted": result["is_promoted"],
        },
    }


@router.get("/report-cards/student")
async def report_card_student(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    enrollment_id: uuid.UUID = Query(...),
    term_id: uuid.UUID = Query(...),
    academic_year_id: uuid.UUID = Query(...),
):
    school_id, actor = ctx
    require_olevel_action(actor, "generateOLevelReports")
    try:
        payload = await _build_report_payload(
            conn, school_id, enrollment_id, term_id, academic_year_id
        )
    except LookupError as exc:
        raise _http_lookup(exc) from exc
    pdf = await generate_olevel_report_pdf_bytes(payload)
    await conn.execute(
        """
        UPDATE olevel_student_results
        SET report_generated=true, report_generated_at=NOW()
        WHERE school_id=$1 AND enrollment_id=$2 AND term_id=$3 AND academic_year_id=$4
        """,
        school_id,
        enrollment_id,
        term_id,
        academic_year_id,
    )
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="olevel-report.pdf"'},
    )


@router.post("/report-cards/class")
async def report_cards_class(
    body: dict[str, Any], ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    require_olevel_action(actor, "generateOLevelReports")
    class_id = uuid.UUID(str(body.get("class_id") or body.get("classId")))
    term_id = uuid.UUID(str(body.get("term_id") or body.get("termId")))
    academic_year_id = uuid.UUID(
        str(body.get("academic_year_id") or body.get("academicYearId"))
    )
    rows = await conn.fetch(
        """
        SELECT e.id, s.full_name
        FROM student_curriculum_enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE e.school_id=$1 AND e.class_id=$2 AND e.academic_year_id=$3
        ORDER BY s.full_name
        """,
        school_id,
        class_id,
        academic_year_id,
    )
    buf = io.BytesIO()
    written = 0
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for r in rows:
            try:
                payload = await _build_report_payload(
                    conn, school_id, r["id"], term_id, academic_year_id
                )
            except (HTTPException, LookupError):
                continue
            pdf = await generate_olevel_report_pdf_bytes(payload)
            safe = "".join(c if c.isalnum() or c in "-_ " else "_" for c in r["full_name"])
            zf.writestr(f"{safe or r['id']}.pdf", pdf)
            written += 1
            await conn.execute(
                """
                UPDATE olevel_student_results
                SET report_generated=true, report_generated_at=NOW()
                WHERE school_id=$1 AND enrollment_id=$2 AND term_id=$3 AND academic_year_id=$4
                """,
                school_id,
                r["id"],
                term_id,
                academic_year_id,
            )
    if written == 0:
        raise HTTPException(
            422,
            detail={
                "error": "No report cards available. Generate results for this class and term first.",
                "code": "RESULTS_MISSING",
            },
        )
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="olevel-reports.zip"'},
    )


@router.get("/teacher/assignments")
async def teacher_assignments(
    ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    """Open sessions + subjects assigned to the current teacher."""
    school_id, actor = ctx
    require_olevel_action(actor, "enterOLevelMarks")
    teacher_id = actor_user_id(actor)
    rows = await conn.fetch(
        """
        SELECT es.id AS session_id, es.title, es.status, es.max_marks,
               es.class_id, es.term_id, es.academic_year_id, es.category_id,
               c.name AS category_name, t.name AS term_name,
               CASE WHEN sc.stream IS NULL OR sc.stream = '' THEN sc.level
                    ELSE sc.level || ' ' || sc.stream END AS class_name,
               os.id AS subject_id, os.name AS subject_name, os.code AS subject_code,
               COALESCE(ms.status, 'draft') AS submission_status,
               (SELECT COUNT(*) FROM olevel_marks m
                 WHERE m.exam_session_id = es.id AND m.subject_id = os.id) AS entered_count,
               (SELECT COUNT(*) FROM student_subject_registrations r
                 JOIN student_curriculum_enrollments e ON e.id = r.enrollment_id
                WHERE e.class_id = es.class_id AND e.academic_year_id = es.academic_year_id
                  AND r.subject_id = os.id AND r.status = 'active') AS student_count
        FROM olevel_exam_sessions es
        JOIN school_classes sc ON sc.id = es.class_id
        JOIN terms t ON t.id = es.term_id
        JOIN curriculum_assessment_categories c ON c.id = es.category_id
        JOIN teacher_class_assignments tca
          ON tca.school_id = es.school_id AND tca.class_id = es.class_id
         AND tca.teacher_id = $2 AND tca.subject_id IS NOT NULL
        JOIN olevel_subjects os
          ON os.school_subject_id = tca.subject_id AND os.school_id = es.school_id
         AND os.is_active = true
        LEFT JOIN olevel_mark_submissions ms
          ON ms.exam_session_id = es.id AND ms.subject_id = os.id AND ms.teacher_id = $2
        WHERE es.school_id = $1 AND es.status = 'open' AND es.deleted_at IS NULL
        ORDER BY sc.level, os.name
        """,
        school_id,
        teacher_id,
    )
    return _ok(
        [
            {
                "examSessionId": str(r["session_id"]),
                "title": r["title"],
                "status": r["status"],
                "maxMarks": float(r["max_marks"]),
                "classId": str(r["class_id"]),
                "className": r["class_name"],
                "termId": str(r["term_id"]),
                "termName": r["term_name"],
                "academicYearId": str(r["academic_year_id"]),
                "categoryId": str(r["category_id"]),
                "categoryName": r["category_name"],
                "subjectId": str(r["subject_id"]),
                "subjectName": r["subject_name"],
                "subjectCode": r["subject_code"],
                "submissionStatus": r["submission_status"],
                "enteredCount": int(r["entered_count"] or 0),
                "studentCount": int(r["student_count"] or 0),
            }
            for r in rows
        ]
    )
