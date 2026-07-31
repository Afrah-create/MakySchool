"""Traditional UACE A-Level module.

Subjects, combinations, student enrollments, termly grade entry, and computed
results. Grading logic lives in app.lib.alevel (pure, tested separately).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated, Any, Optional

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, field_validator

from app.db.pool import get_db
from app.lib.alevel import (
    PRINCIPAL_BANDS,
    PRINCIPAL_PASS_GRADES,
    SUBSIDIARY_PASS_THRESHOLD,
    compute_grade,
    compute_student_totals,
    grade_descriptor,
)
from app.lib.alevel_access import (
    EXAM_SELECT,
    assert_alevel_enabled,
    assert_exam_open,
    assert_teacher_can_edit_marks,
    assert_teacher_can_grade_class,
    fetch_exam,
    fetch_teacher_submission,
    list_exam_submissions,
    require_exam,
    teacher_assigned_alevel_class_ids,
    _serialize_exam,
)
from app.lib.classes import A_LEVEL_CLASS_LEVELS
from app.lib.teacher_assignments import format_class_name
from app.middleware.subscription_guard import require_tenant_with_subscription

TenantCtx = Annotated[
    tuple[uuid.UUID, dict[str, Any]],
    Depends(require_tenant_with_subscription),
]


async def _require_alevel_school(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
) -> None:
    school_id, _actor = ctx
    await assert_alevel_enabled(conn, school_id)


router = APIRouter(dependencies=[Depends(_require_alevel_school)])

MANAGE_ROLES = {"admin"}
VIEW_ROLES = {"admin", "head_teacher"}
GRADE_ROLES = {"admin", "head_teacher", "teacher"}
"""Roles that may view the grade grid (admin/HT see all; teachers see own subjects)."""
TEACHER_WRITE_ROLES = {"teacher"}
"""Only teachers enter and submit marks. Admin/HT are view-only + unlock."""

SUBJECT_TYPES = frozenset({"principal", "subsidiary"})
COMBINATION_CATEGORIES = frozenset({"science", "arts", "business", "technical"})
PRINCIPALS_PER_COMBINATION = 3


# ── Permission helpers ────────────────────────────────────────────────────────
def _require(actor: dict[str, Any], roles: set[str], msg: str) -> None:
    if actor["role"] not in roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": msg, "code": "FORBIDDEN"},
        )


def _actor_id(actor: dict[str, Any]) -> uuid.UUID:
    return uuid.UUID(str(actor.get("user_db_id") or actor["sub"]))


# ── Config loading ────────────────────────────────────────────────────────────
async def _load_grading_config(
    conn: asyncpg.Connection, school_id: uuid.UUID
) -> tuple[list[tuple[float, str, int]], float]:
    """Return (principal_bands, subsidiary_threshold), falling back to defaults."""
    band_rows = await conn.fetch(
        "SELECT min_score, grade, points FROM alevel_grade_bands WHERE school_id = $1",
        school_id,
    )
    bands: list[tuple[float, str, int]] = (
        [(float(r["min_score"]), r["grade"], int(r["points"])) for r in band_rows]
        if band_rows
        else list(PRINCIPAL_BANDS)
    )

    threshold = await conn.fetchval(
        "SELECT subsidiary_pass_threshold FROM alevel_config WHERE school_id = $1",
        school_id,
    )
    return bands, float(threshold) if threshold is not None else SUBSIDIARY_PASS_THRESHOLD


# ── Serializers ───────────────────────────────────────────────────────────────
def _subject(row: asyncpg.Record) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "schoolSubjectId": str(row["school_subject_id"]),
        "name": row["name"],
        "code": row["code"],
        "subjectType": row["subject_type"],
        "isGp": row["is_gp"],
        "isActive": row["is_active"],
    }


# Columns every A-Level subject SELECT must expose for _subject().
SUBJECT_COLUMNS = """
    s.id, s.school_subject_id, ss.name, s.code, s.subject_type, s.is_gp, s.is_active
"""
SUBJECT_FROM = """
    FROM alevel_subjects s
    JOIN school_subjects ss ON ss.id = s.school_subject_id
"""


def _class_name(row: asyncpg.Record) -> str | None:
    return format_class_name(row["level"], row["stream"]) if row.get("level") else None


# ══════════════════════════════════════════════════════════════════════════════
# Selector context: A-Level classes (S5/S6 only) and terms
# ══════════════════════════════════════════════════════════════════════════════
@router.get("/classes")
async def list_alevel_classes(ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)):
    """Only S5/S6 classes — combinations are an Advanced-level concept.

    Teachers only see classes where they have a subject teaching assignment.
    """
    school_id, actor = ctx
    _require(actor, GRADE_ROLES | VIEW_ROLES, "You cannot access A-Level.")

    if actor["role"] == "teacher":
        class_ids = await teacher_assigned_alevel_class_ids(
            conn, school_id, _actor_id(actor)
        )
        if not class_ids:
            return {"data": []}
        rows = await conn.fetch(
            """
            SELECT id, level, stream
            FROM school_classes
            WHERE school_id = $1 AND id = ANY($2::uuid[])
            ORDER BY level, COALESCE(sort_order, 9999), COALESCE(stream, '')
            """,
            school_id,
            class_ids,
        )
    else:
        rows = await conn.fetch(
            """
            SELECT id, level, stream
            FROM school_classes
            WHERE school_id = $1 AND level = ANY($2::text[])
            ORDER BY level, COALESCE(sort_order, 9999), COALESCE(stream, '')
            """,
            school_id,
            list(A_LEVEL_CLASS_LEVELS),
        )
    return {
        "data": [
            {"id": str(r["id"]), "level": r["level"], "stream": r["stream"]}
            for r in rows
        ]
    }


async def _assert_alevel_class(
    conn: asyncpg.Connection, school_id: uuid.UUID, class_id: uuid.UUID
) -> None:
    level = await conn.fetchval(
        "SELECT level FROM school_classes WHERE id = $1 AND school_id = $2",
        class_id,
        school_id,
    )
    if level is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Class not found.", "code": "INVALID_CLASS"},
        )
    if level not in A_LEVEL_CLASS_LEVELS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "Only S5 and S6 classes can take A-Level combinations.",
                "code": "NOT_ALEVEL_CLASS",
            },
        )


# ══════════════════════════════════════════════════════════════════════════════
# Terms (each carrying its academic year)
# ══════════════════════════════════════════════════════════════════════════════
@router.get("/terms")
async def list_terms(ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)):
    school_id, actor = ctx
    _require(actor, GRADE_ROLES | VIEW_ROLES, "You cannot access A-Level.")
    rows = await conn.fetch(
        """
        SELECT t.id, t.name, t.is_current, t.start_date,
               ay.id AS academic_year_id, ay.year, ay.is_current AS year_is_current
        FROM terms t
        JOIN academic_years ay ON ay.id = t.academic_year_id
        WHERE t.school_id = $1
        ORDER BY ay.year DESC, t.start_date ASC NULLS LAST, t.name ASC
        """,
        school_id,
    )
    return {
        "data": [
            {
                "id": str(r["id"]),
                "name": r["name"],
                "isCurrent": r["is_current"],
                "academicYearId": str(r["academic_year_id"]),
                "year": r["year"],
                "yearIsCurrent": r["year_is_current"],
            }
            for r in rows
        ]
    }


# ══════════════════════════════════════════════════════════════════════════════
# Grading scale configuration
# ══════════════════════════════════════════════════════════════════════════════
class GradeBandBody(BaseModel):
    minScore: float
    grade: str
    points: int

    @field_validator("grade")
    @classmethod
    def grade_ok(cls, v: str) -> str:
        text = (v or "").strip().upper()
        if not (1 <= len(text) <= 3):
            raise ValueError("grade must be 1-3 characters")
        return text


class GradingScaleBody(BaseModel):
    bands: list[GradeBandBody]
    subsidiaryPassThreshold: float

    @field_validator("bands")
    @classmethod
    def bands_ok(cls, v: list[GradeBandBody]) -> list[GradeBandBody]:
        if not v:
            raise ValueError("At least one grade band is required")
        grades = [b.grade.strip().upper() for b in v]
        if len(set(grades)) != len(grades):
            raise ValueError("Duplicate grade letters are not allowed")
        return v


@router.get("/grading-scale")
async def get_grading_scale(ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)):
    school_id, actor = ctx
    _require(actor, VIEW_ROLES | GRADE_ROLES, "You cannot view the grading scale.")
    bands, threshold = await _load_grading_config(conn, school_id)
    existing_grades = await conn.fetchval(
        "SELECT COUNT(*)::int FROM alevel_grades WHERE school_id = $1",
        school_id,
    )
    return {
        "data": {
            "bands": [
                {"minScore": b[0], "grade": b[1], "points": b[2]}
                for b in sorted(bands, key=lambda x: x[0], reverse=True)
            ],
            "subsidiaryPassThreshold": threshold,
            "existingGradeCount": int(existing_grades or 0),
        }
    }


@router.put("/grading-scale")
async def put_grading_scale(
    body: GradingScaleBody, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    """Update the school scale used for *new* grade entries.

    Already-stored grade letters and points are never recomputed — historical
    results stay frozen so report cards remain stable after a scale change.
    """
    school_id, actor = ctx
    _require(actor, MANAGE_ROLES, "Only admins can configure the grading scale.")

    existing_grades = await conn.fetchval(
        "SELECT COUNT(*)::int FROM alevel_grades WHERE school_id = $1",
        school_id,
    )

    async with conn.transaction():
        await conn.execute(
            "DELETE FROM alevel_grade_bands WHERE school_id = $1", school_id
        )
        for band in body.bands:
            await conn.execute(
                """
                INSERT INTO alevel_grade_bands (school_id, min_score, grade, points)
                VALUES ($1, $2, $3, $4)
                """,
                school_id,
                band.minScore,
                band.grade.strip().upper(),
                band.points,
            )
        await conn.execute(
            """
            INSERT INTO alevel_config (school_id, subsidiary_pass_threshold, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (school_id)
            DO UPDATE SET subsidiary_pass_threshold = EXCLUDED.subsidiary_pass_threshold,
                          updated_at = NOW()
            """,
            school_id,
            body.subsidiaryPassThreshold,
        )

    return {
        "data": {
            "ok": True,
            "existingGradeCount": int(existing_grades or 0),
            "message": (
                f"Scale saved. {existing_grades} existing grade"
                f"{'' if existing_grades == 1 else 's'} keep their stored "
                "letter/points and will not be recomputed."
                if existing_grades
                else "Scale saved. New entries will use these bands."
            ),
        }
    }


# ══════════════════════════════════════════════════════════════════════════════
# Subjects
# ══════════════════════════════════════════════════════════════════════════════
class SubjectCreateBody(BaseModel):
    """Attach an A-Level profile to a catalogue subject.

    Provide either schoolSubjectId (existing catalogue subject) or name
    (creates the catalogue subject too). Name is otherwise managed from the
    Academics > Subjects page.
    """

    schoolSubjectId: uuid.UUID | None = None
    name: str | None = None
    code: str
    subjectType: str
    isGp: bool = False
    isActive: bool = True

    @field_validator("name")
    @classmethod
    def name_ok(cls, v: str | None) -> str | None:
        if v is None:
            return None
        text = v.strip()
        if text and len(text) < 2:
            raise ValueError("name must be at least 2 characters")
        return text or None

    @field_validator("code")
    @classmethod
    def code_ok(cls, v: str) -> str:
        text = (v or "").strip().upper()
        if not text:
            raise ValueError("code is required")
        return text

    @field_validator("subjectType")
    @classmethod
    def type_ok(cls, v: str) -> str:
        if v not in SUBJECT_TYPES:
            raise ValueError("subjectType must be 'principal' or 'subsidiary'")
        return v


class SubjectUpdateBody(BaseModel):
    """Update A-Level-specific fields only; the name belongs to the catalogue."""

    code: str
    subjectType: str
    isGp: bool = False
    isActive: bool = True

    @field_validator("code")
    @classmethod
    def code_ok(cls, v: str) -> str:
        text = (v or "").strip().upper()
        if not text:
            raise ValueError("code is required")
        return text

    @field_validator("subjectType")
    @classmethod
    def type_ok(cls, v: str) -> str:
        if v not in SUBJECT_TYPES:
            raise ValueError("subjectType must be 'principal' or 'subsidiary'")
        return v


async def _resolve_catalogue_subject(
    conn: asyncpg.Connection, school_id: uuid.UUID, body: SubjectCreateBody
) -> uuid.UUID:
    """Return the school_subjects id for the profile, creating it if needed."""
    if body.schoolSubjectId:
        found = await conn.fetchval(
            "SELECT id FROM school_subjects WHERE id = $1 AND school_id = $2",
            body.schoolSubjectId,
            school_id,
        )
        if not found:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "Catalogue subject not found.", "code": "INVALID_SUBJECT"},
            )
        return found

    if not body.name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "Pick a catalogue subject or provide a name for a new one.",
                "code": "VALIDATION_ERROR",
            },
        )

    existing = await conn.fetchval(
        "SELECT id FROM school_subjects WHERE school_id = $1 AND LOWER(name) = LOWER($2)",
        school_id,
        body.name,
    )
    if existing:
        return existing

    return await conn.fetchval(
        """
        INSERT INTO school_subjects (id, school_id, name)
        VALUES (gen_random_uuid(), $1, $2)
        RETURNING id
        """,
        school_id,
        body.name,
    )


@router.get("/subjects")
async def list_subjects(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    include_inactive: bool = Query(True),
):
    school_id, actor = ctx
    _require(actor, GRADE_ROLES | VIEW_ROLES, "You cannot access A-Level subjects.")
    where = "s.school_id = $1" + ("" if include_inactive else " AND s.is_active = true")
    rows = await conn.fetch(
        f"""
        SELECT {SUBJECT_COLUMNS}
        {SUBJECT_FROM}
        WHERE {where}
        ORDER BY s.subject_type, ss.name
        """,
        school_id,
    )
    return {"data": [_subject(r) for r in rows]}


@router.post("/subjects", status_code=status.HTTP_201_CREATED)
async def create_subject(
    body: SubjectCreateBody, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    _require(actor, MANAGE_ROLES, "Only admins can manage A-Level subjects.")

    dup_code = await conn.fetchval(
        "SELECT 1 FROM alevel_subjects WHERE school_id = $1 AND code = $2",
        school_id,
        body.code,
    )
    if dup_code:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "A subject with this code already exists.", "code": "DUPLICATE"},
        )

    async with conn.transaction():
        school_subject_id = await _resolve_catalogue_subject(conn, school_id, body)

        dup_profile = await conn.fetchval(
            "SELECT 1 FROM alevel_subjects WHERE school_id = $1 AND school_subject_id = $2",
            school_id,
            school_subject_id,
        )
        if dup_profile:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "error": "This subject already has an A-Level profile.",
                    "code": "DUPLICATE",
                },
            )

        subject_id = await conn.fetchval(
            """
            INSERT INTO alevel_subjects
              (school_id, school_subject_id, code, subject_type, is_gp, is_active)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
            """,
            school_id,
            school_subject_id,
            body.code,
            body.subjectType,
            body.isGp,
            body.isActive,
        )

    row = await conn.fetchrow(
        f"SELECT {SUBJECT_COLUMNS} {SUBJECT_FROM} WHERE s.id = $1",
        subject_id,
    )
    return {"data": _subject(row)}


@router.patch("/subjects/{subject_id}")
async def update_subject(
    subject_id: uuid.UUID,
    body: SubjectUpdateBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    _require(actor, MANAGE_ROLES, "Only admins can manage A-Level subjects.")
    dup = await conn.fetchval(
        "SELECT 1 FROM alevel_subjects WHERE school_id = $1 AND code = $2 AND id <> $3",
        school_id,
        body.code,
        subject_id,
    )
    if dup:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "A subject with this code already exists.", "code": "DUPLICATE"},
        )
    updated = await conn.fetchval(
        """
        UPDATE alevel_subjects
        SET code = $1, subject_type = $2, is_gp = $3, is_active = $4, updated_at = NOW()
        WHERE id = $5 AND school_id = $6
        RETURNING id
        """,
        body.code,
        body.subjectType,
        body.isGp,
        body.isActive,
        subject_id,
        school_id,
    )
    if not updated:
        raise HTTPException(status_code=404, detail={"error": "Subject not found"})
    row = await conn.fetchrow(
        f"SELECT {SUBJECT_COLUMNS} {SUBJECT_FROM} WHERE s.id = $1",
        subject_id,
    )
    return {"data": _subject(row)}


@router.delete("/subjects/{subject_id}")
async def delete_subject(
    subject_id: uuid.UUID, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    _require(actor, MANAGE_ROLES, "Only admins can manage A-Level subjects.")
    in_use = await conn.fetchval(
        """
        SELECT
          EXISTS(SELECT 1 FROM alevel_combination_subjects WHERE subject_id = $1)
          OR EXISTS(SELECT 1 FROM alevel_grades WHERE subject_id = $1)
        """,
        subject_id,
    )
    if in_use:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "This subject is used by a combination or has grades. Deactivate it instead.",
                "code": "SUBJECT_IN_USE",
            },
        )
    deleted = await conn.fetchval(
        "DELETE FROM alevel_subjects WHERE id = $1 AND school_id = $2 RETURNING id",
        subject_id,
        school_id,
    )
    if not deleted:
        raise HTTPException(status_code=404, detail={"error": "Subject not found"})
    return {"data": {"ok": True}}


# ══════════════════════════════════════════════════════════════════════════════
# Combinations
# ══════════════════════════════════════════════════════════════════════════════
class CombinationBody(BaseModel):
    name: str
    label: str | None = None
    category: str
    subjectIds: list[uuid.UUID]

    @field_validator("name")
    @classmethod
    def name_ok(cls, v: str) -> str:
        text = (v or "").strip().upper()
        if len(text) < 2:
            raise ValueError("name must be at least 2 characters")
        return text

    @field_validator("category")
    @classmethod
    def category_ok(cls, v: str) -> str:
        if v not in COMBINATION_CATEGORIES:
            raise ValueError("Invalid combination category")
        return v

    @field_validator("subjectIds")
    @classmethod
    def subjects_ok(cls, v: list[uuid.UUID]) -> list[uuid.UUID]:
        unique = list(dict.fromkeys(v))
        if len(unique) != PRINCIPALS_PER_COMBINATION:
            raise ValueError("A combination must have exactly 3 distinct principal subjects")
        return unique


async def _combination_rows(
    conn: asyncpg.Connection, school_id: uuid.UUID
) -> list[dict[str, Any]]:
    combos = await conn.fetch(
        """
        SELECT id, name, label, category, is_active
        FROM alevel_combinations
        WHERE school_id = $1
        ORDER BY category, name
        """,
        school_id,
    )
    links = await conn.fetch(
        f"""
        SELECT cs.combination_id, {SUBJECT_COLUMNS}
        FROM alevel_combination_subjects cs
        JOIN alevel_subjects s ON s.id = cs.subject_id
        JOIN school_subjects ss ON ss.id = s.school_subject_id
        WHERE cs.school_id = $1
        ORDER BY ss.name
        """,
        school_id,
    )
    by_combo: dict[str, list[dict[str, Any]]] = {}
    for link in links:
        by_combo.setdefault(str(link["combination_id"]), []).append(_subject(link))

    return [
        {
            "id": str(c["id"]),
            "name": c["name"],
            "label": c["label"],
            "category": c["category"],
            "isActive": c["is_active"],
            "subjects": by_combo.get(str(c["id"]), []),
        }
        for c in combos
    ]


async def _validate_principals(
    conn: asyncpg.Connection, school_id: uuid.UUID, subject_ids: list[uuid.UUID]
) -> None:
    valid = await conn.fetchval(
        """
        SELECT COUNT(*)::int FROM alevel_subjects
        WHERE school_id = $1 AND id = ANY($2::uuid[]) AND subject_type = 'principal'
        """,
        school_id,
        subject_ids,
    )
    if int(valid or 0) != len(subject_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "All 3 subjects must be existing principal subjects.",
                "code": "INVALID_SUBJECTS",
            },
        )


@router.get("/combinations")
async def list_combinations(ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)):
    school_id, actor = ctx
    _require(actor, GRADE_ROLES | VIEW_ROLES, "You cannot access A-Level combinations.")
    return {"data": await _combination_rows(conn, school_id)}


@router.post("/combinations", status_code=status.HTTP_201_CREATED)
async def create_combination(
    body: CombinationBody, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    _require(actor, MANAGE_ROLES, "Only admins can manage combinations.")
    await _validate_principals(conn, school_id, body.subjectIds)
    dup = await conn.fetchval(
        "SELECT 1 FROM alevel_combinations WHERE school_id = $1 AND name = $2",
        school_id,
        body.name,
    )
    if dup:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "A combination with this name already exists.", "code": "DUPLICATE"},
        )
    async with conn.transaction():
        combo_id = await conn.fetchval(
            """
            INSERT INTO alevel_combinations (school_id, name, label, category)
            VALUES ($1, $2, $3, $4)
            RETURNING id
            """,
            school_id,
            body.name,
            (body.label or "").strip() or None,
            body.category,
        )
        for subject_id in body.subjectIds:
            await conn.execute(
                """
                INSERT INTO alevel_combination_subjects (school_id, combination_id, subject_id)
                VALUES ($1, $2, $3)
                """,
                school_id,
                combo_id,
                subject_id,
            )
    rows = await _combination_rows(conn, school_id)
    created = next((c for c in rows if c["id"] == str(combo_id)), None)
    return {"data": created}


@router.patch("/combinations/{combination_id}")
async def update_combination(
    combination_id: uuid.UUID,
    body: CombinationBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    _require(actor, MANAGE_ROLES, "Only admins can manage combinations.")
    exists = await conn.fetchval(
        "SELECT 1 FROM alevel_combinations WHERE id = $1 AND school_id = $2",
        combination_id,
        school_id,
    )
    if not exists:
        raise HTTPException(status_code=404, detail={"error": "Combination not found"})
    await _validate_principals(conn, school_id, body.subjectIds)
    dup = await conn.fetchval(
        "SELECT 1 FROM alevel_combinations WHERE school_id = $1 AND name = $2 AND id <> $3",
        school_id,
        body.name,
        combination_id,
    )
    if dup:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "A combination with this name already exists.", "code": "DUPLICATE"},
        )
    async with conn.transaction():
        await conn.execute(
            """
            UPDATE alevel_combinations
            SET name = $1, label = $2, category = $3
            WHERE id = $4 AND school_id = $5
            """,
            body.name,
            (body.label or "").strip() or None,
            body.category,
            combination_id,
            school_id,
        )
        await conn.execute(
            "DELETE FROM alevel_combination_subjects WHERE combination_id = $1 AND school_id = $2",
            combination_id,
            school_id,
        )
        for subject_id in body.subjectIds:
            await conn.execute(
                """
                INSERT INTO alevel_combination_subjects (school_id, combination_id, subject_id)
                VALUES ($1, $2, $3)
                """,
                school_id,
                combination_id,
                subject_id,
            )
    rows = await _combination_rows(conn, school_id)
    updated = next((c for c in rows if c["id"] == str(combination_id)), None)
    return {"data": updated}


@router.delete("/combinations/{combination_id}")
async def delete_combination(
    combination_id: uuid.UUID, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    _require(actor, MANAGE_ROLES, "Only admins can manage combinations.")
    in_use = await conn.fetchval(
        "SELECT 1 FROM alevel_enrollments WHERE combination_id = $1 LIMIT 1",
        combination_id,
    )
    if in_use:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "Students are enrolled in this combination. Move them first.",
                "code": "COMBINATION_IN_USE",
            },
        )
    deleted = await conn.fetchval(
        "DELETE FROM alevel_combinations WHERE id = $1 AND school_id = $2 RETURNING id",
        combination_id,
        school_id,
    )
    if not deleted:
        raise HTTPException(status_code=404, detail={"error": "Combination not found"})
    return {"data": {"ok": True}}


# ══════════════════════════════════════════════════════════════════════════════
# Enrollments
# ══════════════════════════════════════════════════════════════════════════════
class EnrollmentBody(BaseModel):
    studentId: uuid.UUID
    combinationId: uuid.UUID
    academicYearId: uuid.UUID
    subsidiarySubjectId: uuid.UUID | None = None
    classId: uuid.UUID | None = None


def _enrollment(row: asyncpg.Record) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "studentId": str(row["student_id"]),
        "studentName": row["student_name"],
        "learnerId": row["learner_id"],
        "combinationId": str(row["combination_id"]),
        "combinationName": row["combination_name"],
        "academicYearId": str(row["academic_year_id"]),
        "subsidiarySubjectId": str(row["subsidiary_subject_id"])
        if row["subsidiary_subject_id"]
        else None,
        "subsidiarySubjectName": row.get("subsidiary_subject_name"),
        "classId": str(row["class_id"]) if row["class_id"] else None,
        "className": _class_name(row),
        "isActive": row["is_active"],
    }


ENROLLMENT_SELECT = """
    SELECT e.id, e.student_id, s.full_name AS student_name, s.learner_id,
           e.combination_id, c.name AS combination_name,
           e.academic_year_id, e.subsidiary_subject_id,
           subss.name AS subsidiary_subject_name,
           e.class_id, sc.level, sc.stream, e.is_active
    FROM alevel_enrollments e
    JOIN students s ON s.id = e.student_id
    JOIN alevel_combinations c ON c.id = e.combination_id
    LEFT JOIN alevel_subjects sub ON sub.id = e.subsidiary_subject_id
    LEFT JOIN school_subjects subss ON subss.id = sub.school_subject_id
    LEFT JOIN school_classes sc ON sc.id = e.class_id
"""


@router.get("/enrollments")
async def list_enrollments(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    academic_year_id: Optional[uuid.UUID] = Query(None),
    class_id: Optional[uuid.UUID] = Query(None),
    combination_id: Optional[uuid.UUID] = Query(None),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
):
    school_id, actor = ctx
    _require(actor, GRADE_ROLES | VIEW_ROLES, "You cannot access A-Level enrollments.")

    if category and category not in COMBINATION_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Invalid combination category.", "code": "VALIDATION_ERROR"},
        )

    conditions = ["e.school_id = $1"]
    params: list[Any] = [school_id]
    idx = 2
    if academic_year_id:
        conditions.append(f"e.academic_year_id = ${idx}")
        params.append(academic_year_id)
        idx += 1
    if class_id:
        conditions.append(f"e.class_id = ${idx}")
        params.append(class_id)
        idx += 1
    if combination_id:
        conditions.append(f"e.combination_id = ${idx}")
        params.append(combination_id)
        idx += 1
    if category:
        conditions.append(f"c.category = ${idx}")
        params.append(category)
        idx += 1
    if search and search.strip():
        conditions.append(f"(s.full_name ILIKE ${idx} OR s.learner_id ILIKE ${idx})")
        params.append(f"%{search.strip()}%")
        idx += 1

    rows = await conn.fetch(
        f"{ENROLLMENT_SELECT} WHERE {' AND '.join(conditions)} ORDER BY s.full_name",
        *params,
    )
    return {"data": [_enrollment(r) for r in rows]}


@router.post("/enrollments", status_code=status.HTTP_201_CREATED)
async def create_enrollment(
    body: EnrollmentBody, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    _require(actor, MANAGE_ROLES, "Only admins can manage enrollments.")

    combo = await conn.fetchval(
        "SELECT 1 FROM alevel_combinations WHERE id = $1 AND school_id = $2",
        body.combinationId,
        school_id,
    )
    if not combo:
        raise HTTPException(status_code=400, detail={"error": "Invalid combination."})
    student = await conn.fetchval(
        "SELECT 1 FROM students WHERE id = $1 AND school_id = $2",
        body.studentId,
        school_id,
    )
    if not student:
        raise HTTPException(status_code=400, detail={"error": "Invalid student."})
    if body.subsidiarySubjectId:
        sub_ok = await conn.fetchval(
            """
            SELECT 1 FROM alevel_subjects
            WHERE id = $1 AND school_id = $2 AND subject_type = 'subsidiary'
            """,
            body.subsidiarySubjectId,
            school_id,
        )
        if not sub_ok:
            raise HTTPException(
                status_code=400, detail={"error": "Invalid subsidiary subject."}
            )

    existing = await conn.fetchval(
        """
        SELECT 1 FROM alevel_enrollments
        WHERE school_id = $1 AND student_id = $2 AND academic_year_id = $3
        """,
        school_id,
        body.studentId,
        body.academicYearId,
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "This student is already enrolled for the selected year.",
                "code": "ALREADY_ENROLLED",
            },
        )

    class_id = body.classId
    if class_id is None:
        class_id = await conn.fetchval(
            "SELECT current_class_id FROM students WHERE id = $1 AND school_id = $2",
            body.studentId,
            school_id,
        )
    if class_id is not None:
        await _assert_alevel_class(conn, school_id, class_id)

    enrollment_id = await conn.fetchval(
        """
        INSERT INTO alevel_enrollments
          (school_id, student_id, combination_id, academic_year_id, subsidiary_subject_id, class_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
        """,
        school_id,
        body.studentId,
        body.combinationId,
        body.academicYearId,
        body.subsidiarySubjectId,
        class_id,
    )
    row = await conn.fetchrow(
        f"{ENROLLMENT_SELECT} WHERE e.id = $1", enrollment_id
    )
    return {"data": _enrollment(row)}


class BulkEnrollmentBody(BaseModel):
    studentIds: list[uuid.UUID]
    combinationId: uuid.UUID
    academicYearId: uuid.UUID
    classId: uuid.UUID
    subsidiarySubjectId: uuid.UUID | None = None

    @field_validator("studentIds")
    @classmethod
    def students_ok(cls, v: list[uuid.UUID]) -> list[uuid.UUID]:
        unique = list(dict.fromkeys(v))
        if not unique:
            raise ValueError("Select at least one student")
        if len(unique) > 300:
            raise ValueError("Enroll at most 300 students at a time")
        return unique


@router.post("/enrollments/bulk")
async def bulk_create_enrollments(
    body: BulkEnrollmentBody, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    """Enroll many students into one combination. Already-enrolled students are skipped."""
    school_id, actor = ctx
    _require(actor, MANAGE_ROLES, "Only admins can manage enrollments.")

    combo = await conn.fetchval(
        "SELECT 1 FROM alevel_combinations WHERE id = $1 AND school_id = $2",
        body.combinationId,
        school_id,
    )
    if not combo:
        raise HTTPException(status_code=400, detail={"error": "Invalid combination."})

    await _assert_alevel_class(conn, school_id, body.classId)

    if body.subsidiarySubjectId:
        sub_ok = await conn.fetchval(
            """
            SELECT 1 FROM alevel_subjects
            WHERE id = $1 AND school_id = $2 AND subject_type = 'subsidiary'
            """,
            body.subsidiarySubjectId,
            school_id,
        )
        if not sub_ok:
            raise HTTPException(
                status_code=400, detail={"error": "Invalid subsidiary subject."}
            )

    valid_student_ids = [
        r["id"]
        for r in await conn.fetch(
            """
            SELECT id FROM students
            WHERE school_id = $1 AND id = ANY($2::uuid[]) AND status = 'active'
            """,
            school_id,
            body.studentIds,
        )
    ]
    invalid = len(body.studentIds) - len(valid_student_ids)

    already = {
        r["student_id"]
        for r in await conn.fetch(
            """
            SELECT student_id FROM alevel_enrollments
            WHERE school_id = $1 AND academic_year_id = $2 AND student_id = ANY($3::uuid[])
            """,
            school_id,
            body.academicYearId,
            valid_student_ids,
        )
    }
    to_enroll = [sid for sid in valid_student_ids if sid not in already]

    if to_enroll:
        async with conn.transaction():
            await conn.execute(
                """
                INSERT INTO alevel_enrollments
                  (school_id, student_id, combination_id, academic_year_id,
                   subsidiary_subject_id, class_id)
                SELECT $1, u.student_id, $2, $3, $4, $5
                FROM unnest($6::uuid[]) AS u(student_id)
                ON CONFLICT (school_id, student_id, academic_year_id) DO NOTHING
                """,
                school_id,
                body.combinationId,
                body.academicYearId,
                body.subsidiarySubjectId,
                body.classId,
                to_enroll,
            )

    return {
        "data": {
            "enrolled": len(to_enroll),
            "skipped": len(already),
            "invalid": invalid,
        }
    }


@router.delete("/enrollments/{enrollment_id}")
async def delete_enrollment(
    enrollment_id: uuid.UUID, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    _require(actor, MANAGE_ROLES, "Only admins can manage enrollments.")
    deleted = await conn.fetchval(
        "DELETE FROM alevel_enrollments WHERE id = $1 AND school_id = $2 RETURNING id",
        enrollment_id,
        school_id,
    )
    if not deleted:
        raise HTTPException(status_code=404, detail={"error": "Enrollment not found"})
    return {"data": {"ok": True}}


# ══════════════════════════════════════════════════════════════════════════════
# Exam types
# ══════════════════════════════════════════════════════════════════════════════
def _exam_type(row: asyncpg.Record) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "code": row["code"],
        "sortOrder": int(row["sort_order"]),
        "isActive": row["is_active"],
    }


class ExamTypeCreateBody(BaseModel):
    name: str
    code: str
    sortOrder: int = 0
    isActive: bool = True

    @field_validator("name", "code")
    @classmethod
    def non_empty(cls, v: str) -> str:
        text = (v or "").strip()
        if not text:
            raise ValueError("must not be empty")
        return text


class ExamTypeUpdateBody(BaseModel):
    name: str | None = None
    code: str | None = None
    sortOrder: int | None = None
    isActive: bool | None = None

    @field_validator("name", "code")
    @classmethod
    def non_empty_optional(cls, v: str | None) -> str | None:
        if v is None:
            return None
        text = v.strip()
        if not text:
            raise ValueError("must not be empty")
        return text


@router.get("/exam-types")
async def list_exam_types(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    include_inactive: bool = Query(False),
):
    school_id, actor = ctx
    _require(actor, VIEW_ROLES | GRADE_ROLES, "You cannot view exam types.")

    # Schools created after migration 042 get defaults on first visit.
    count = await conn.fetchval(
        "SELECT COUNT(*)::int FROM alevel_exam_types WHERE school_id = $1",
        school_id,
    )
    if not count:
        await conn.execute(
            """
            INSERT INTO alevel_exam_types (school_id, name, code, sort_order)
            VALUES
              ($1, 'Beginning of Term', 'BOT', 1),
              ($1, 'Mid Term', 'MID', 2),
              ($1, 'End of Term', 'EOT', 3)
            ON CONFLICT (school_id, code) DO NOTHING
            """,
            school_id,
        )

    where = "school_id = $1" + ("" if include_inactive else " AND is_active = true")
    rows = await conn.fetch(
        f"""
        SELECT id, name, code, sort_order, is_active
        FROM alevel_exam_types
        WHERE {where}
        ORDER BY sort_order ASC, name ASC
        """,
        school_id,
    )
    return {"data": [_exam_type(r) for r in rows]}


@router.post("/exam-types", status_code=status.HTTP_201_CREATED)
async def create_exam_type(
    body: ExamTypeCreateBody, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    _require(actor, MANAGE_ROLES, "Only admins can manage exam types.")
    code = body.code.upper()
    dup = await conn.fetchval(
        "SELECT 1 FROM alevel_exam_types WHERE school_id = $1 AND code = $2",
        school_id,
        code,
    )
    if dup:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "An exam type with this code already exists.", "code": "DUPLICATE"},
        )
    try:
        row = await conn.fetchrow(
            """
            INSERT INTO alevel_exam_types (school_id, name, code, sort_order, is_active)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, name, code, sort_order, is_active
            """,
            school_id,
            body.name,
            code,
            body.sortOrder,
            body.isActive,
        )
    except asyncpg.UniqueViolationError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "An exam type with this name or code already exists.", "code": "DUPLICATE"},
        )
    return {"data": _exam_type(row)}


@router.patch("/exam-types/{exam_type_id}")
async def update_exam_type(
    exam_type_id: uuid.UUID,
    body: ExamTypeUpdateBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    _require(actor, MANAGE_ROLES, "Only admins can manage exam types.")
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status_code=400, detail={"error": "Provide at least one field to update."}
        )

    if "code" in updates and updates["code"] is not None:
        updates["code"] = updates["code"].upper()
        dup = await conn.fetchval(
            """
            SELECT 1 FROM alevel_exam_types
            WHERE school_id = $1 AND code = $2 AND id <> $3
            """,
            school_id,
            updates["code"],
            exam_type_id,
        )
        if dup:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"error": "An exam type with this code already exists.", "code": "DUPLICATE"},
            )

    set_parts: list[str] = []
    params: list[Any] = []
    idx = 1
    col_map = {
        "name": "name",
        "code": "code",
        "sortOrder": "sort_order",
        "isActive": "is_active",
    }
    for key, col in col_map.items():
        if key in updates:
            set_parts.append(f"{col} = ${idx}")
            params.append(updates[key])
            idx += 1
    params.extend([exam_type_id, school_id])
    try:
        row = await conn.fetchrow(
            f"""
            UPDATE alevel_exam_types
            SET {", ".join(set_parts)}
            WHERE id = ${idx} AND school_id = ${idx + 1}
            RETURNING id, name, code, sort_order, is_active
            """,
            *params,
        )
    except asyncpg.UniqueViolationError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "An exam type with this name or code already exists.", "code": "DUPLICATE"},
        )
    if not row:
        raise HTTPException(status_code=404, detail={"error": "Exam type not found"})
    return {"data": _exam_type(row)}


@router.delete("/exam-types/{exam_type_id}")
async def delete_exam_type(
    exam_type_id: uuid.UUID, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    _require(actor, MANAGE_ROLES, "Only admins can manage exam types.")
    in_use = await conn.fetchval(
        "SELECT 1 FROM alevel_exams WHERE school_id = $1 AND exam_type_id = $2 LIMIT 1",
        school_id,
        exam_type_id,
    )
    if in_use:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "This exam type is used by one or more exams.",
                "code": "EXAM_TYPE_IN_USE",
            },
        )
    deleted = await conn.fetchval(
        "DELETE FROM alevel_exam_types WHERE id = $1 AND school_id = $2 RETURNING id",
        exam_type_id,
        school_id,
    )
    if not deleted:
        raise HTTPException(status_code=404, detail={"error": "Exam type not found"})
    return {"data": {"ok": True}}


# ══════════════════════════════════════════════════════════════════════════════
# Exams (multiple per term)
# ══════════════════════════════════════════════════════════════════════════════
class ExamCreateBody(BaseModel):
    classId: uuid.UUID
    termId: uuid.UUID
    academicYearId: uuid.UUID
    examTypeId: uuid.UUID
    name: str | None = None
    notes: str | None = None
    openNow: bool = False


class ExamUpdateBody(BaseModel):
    name: str | None = None
    notes: str | None = None


async def _exam_progress(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    class_id: uuid.UUID,
    academic_year_id: uuid.UUID,
    exam_id: uuid.UUID,
) -> dict[str, int]:
    """Enrollment-aware cell counts for an exam grade grid."""
    enrollments = await conn.fetch(
        """
        SELECT combination_id, subsidiary_subject_id
        FROM alevel_enrollments
        WHERE school_id = $1 AND class_id = $2 AND academic_year_id = $3
          AND is_active = true
        """,
        school_id,
        class_id,
        academic_year_id,
    )
    student_count = len(enrollments)
    if not enrollments:
        graded = await conn.fetchval(
            "SELECT COUNT(*)::int FROM alevel_grades WHERE school_id = $1 AND exam_id = $2",
            school_id,
            exam_id,
        )
        return {
            "applicableCells": 0,
            "gradedCells": int(graded or 0),
            "studentCount": 0,
        }

    combo_ids = list({e["combination_id"] for e in enrollments})
    principal_rows = await conn.fetch(
        """
        SELECT combination_id, COUNT(*)::int AS n
        FROM alevel_combination_subjects
        WHERE school_id = $1 AND combination_id = ANY($2::uuid[])
        GROUP BY combination_id
        """,
        school_id,
        combo_ids,
    )
    principals_by_combo = {r["combination_id"]: int(r["n"]) for r in principal_rows}
    has_gp = await conn.fetchval(
        """
        SELECT 1 FROM alevel_subjects
        WHERE school_id = $1 AND is_gp = true AND is_active = true
        LIMIT 1
        """,
        school_id,
    )

    applicable = 0
    for e in enrollments:
        applicable += principals_by_combo.get(e["combination_id"], 0)
        if has_gp:
            applicable += 1
        if e["subsidiary_subject_id"]:
            applicable += 1

    graded = await conn.fetchval(
        "SELECT COUNT(*)::int FROM alevel_grades WHERE school_id = $1 AND exam_id = $2",
        school_id,
        exam_id,
    )
    return {
        "applicableCells": applicable,
        "gradedCells": int(graded or 0),
        "studentCount": student_count,
    }


@router.get("/exams")
async def list_exams(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    class_id: uuid.UUID | None = Query(None),
    term_id: uuid.UUID | None = Query(None),
    academic_year_id: uuid.UUID | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
):
    school_id, actor = ctx
    _require(actor, VIEW_ROLES | GRADE_ROLES, "You cannot view exams.")

    conditions = ["e.school_id = $1"]
    params: list[Any] = [school_id]
    idx = 2

    if actor["role"] == "teacher":
        assigned = await teacher_assigned_alevel_class_ids(
            conn, school_id, _actor_id(actor)
        )
        if not assigned:
            return {"data": []}
        conditions.append(f"e.class_id = ANY(${idx}::uuid[])")
        params.append(assigned)
        idx += 1

    if class_id is not None:
        conditions.append(f"e.class_id = ${idx}")
        params.append(class_id)
        idx += 1
    if term_id is not None:
        conditions.append(f"e.term_id = ${idx}")
        params.append(term_id)
        idx += 1
    if academic_year_id is not None:
        conditions.append(f"e.academic_year_id = ${idx}")
        params.append(academic_year_id)
        idx += 1
    if status_filter is not None:
        if status_filter not in {"draft", "open", "closed"}:
            raise HTTPException(
                status_code=400,
                detail={"error": "status must be draft, open, or closed.", "code": "VALIDATION_ERROR"},
            )
        conditions.append(f"e.status = ${idx}")
        params.append(status_filter)
        idx += 1

    rows = await conn.fetch(
        f"""
        {EXAM_SELECT}
        WHERE {" AND ".join(conditions)}
        ORDER BY t.start_date ASC NULLS LAST, et.sort_order ASC, e.created_at ASC
        """,
        *params,
    )

    data = []
    for row in rows:
        exam = _serialize_exam(row)
        progress = await _exam_progress(
            conn,
            school_id,
            uuid.UUID(exam["classId"]),
            uuid.UUID(exam["academicYearId"]),
            uuid.UUID(exam["id"]),
        )
        exam.update(progress)
        data.append(exam)
    return {"data": data}


@router.post("/exams", status_code=status.HTTP_201_CREATED)
async def create_exam(
    body: ExamCreateBody, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    _require(actor, MANAGE_ROLES, "Only admins can create exams.")
    await _assert_alevel_class(conn, school_id, body.classId)
    actor_id = _actor_id(actor)

    exam_type = await conn.fetchrow(
        """
        SELECT id, name FROM alevel_exam_types
        WHERE id = $1 AND school_id = $2 AND is_active = true
        """,
        body.examTypeId,
        school_id,
    )
    if not exam_type:
        raise HTTPException(
            status_code=400,
            detail={"error": "Invalid or inactive exam type.", "code": "INVALID_EXAM_TYPE"},
        )

    term_ok = await conn.fetchval(
        """
        SELECT 1 FROM terms
        WHERE id = $1 AND school_id = $2 AND academic_year_id = $3
        """,
        body.termId,
        school_id,
        body.academicYearId,
    )
    if not term_ok:
        raise HTTPException(
            status_code=400,
            detail={"error": "Term does not belong to this academic year.", "code": "INVALID_TERM"},
        )

    name = (body.name or "").strip() or exam_type["name"]
    status_value = "open" if body.openNow else "draft"
    opened_at = None
    opened_by = None
    if body.openNow:
        opened_at = datetime.now(timezone.utc)
        opened_by = actor_id

    try:
        exam_id = await conn.fetchval(
            """
            INSERT INTO alevel_exams
              (school_id, class_id, term_id, academic_year_id, exam_type_id,
               name, status, notes, opened_at, opened_by, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
            RETURNING id
            """,
            school_id,
            body.classId,
            body.termId,
            body.academicYearId,
            body.examTypeId,
            name,
            status_value,
            body.notes,
            opened_at,
            opened_by,
        )
    except asyncpg.UniqueViolationError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "An exam of this type already exists for this class and term.",
                "code": "DUPLICATE",
            },
        )

    exam = await require_exam(conn, school_id, exam_id)
    progress = await _exam_progress(
        conn, school_id, body.classId, body.academicYearId, exam_id
    )
    exam.update(progress)
    return {"data": exam}


@router.patch("/exams/{exam_id}")
async def update_exam(
    exam_id: uuid.UUID,
    body: ExamUpdateBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    _require(actor, MANAGE_ROLES, "Only admins can update exams.")
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status_code=400, detail={"error": "Provide at least one field to update."}
        )

    set_parts: list[str] = ["updated_at = NOW()"]
    params: list[Any] = []
    idx = 1
    if "name" in updates and updates["name"] is not None:
        name = updates["name"].strip()
        if not name:
            raise HTTPException(
                status_code=400,
                detail={"error": "name must not be empty.", "code": "VALIDATION_ERROR"},
            )
        set_parts.append(f"name = ${idx}")
        params.append(name)
        idx += 1
    if "notes" in updates:
        set_parts.append(f"notes = ${idx}")
        params.append(updates["notes"])
        idx += 1

    params.extend([exam_id, school_id])
    updated = await conn.fetchval(
        f"""
        UPDATE alevel_exams
        SET {", ".join(set_parts)}
        WHERE id = ${idx} AND school_id = ${idx + 1}
        RETURNING id
        """,
        *params,
    )
    if not updated:
        raise HTTPException(status_code=404, detail={"error": "Exam not found"})
    exam = await require_exam(conn, school_id, exam_id)
    progress = await _exam_progress(
        conn,
        school_id,
        uuid.UUID(exam["classId"]),
        uuid.UUID(exam["academicYearId"]),
        exam_id,
    )
    exam.update(progress)
    return {"data": exam}


@router.delete("/exams/{exam_id}")
async def delete_exam(
    exam_id: uuid.UUID, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    _require(actor, MANAGE_ROLES, "Only admins can delete exams.")
    has_grades = await conn.fetchval(
        "SELECT 1 FROM alevel_grades WHERE school_id = $1 AND exam_id = $2 LIMIT 1",
        school_id,
        exam_id,
    )
    if has_grades:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "This exam has grades. Clear them before deleting.",
                "code": "EXAM_HAS_GRADES",
            },
        )
    deleted = await conn.fetchval(
        "DELETE FROM alevel_exams WHERE id = $1 AND school_id = $2 RETURNING id",
        exam_id,
        school_id,
    )
    if not deleted:
        raise HTTPException(status_code=404, detail={"error": "Exam not found"})
    return {"data": {"ok": True}}


@router.post("/exams/{exam_id}/open")
async def open_exam(
    exam_id: uuid.UUID, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    """Open a draft exam (VIEW) or reopen a closed exam (MANAGE)."""
    school_id, actor = ctx
    exam = await require_exam(conn, school_id, exam_id)
    current = exam["status"]

    if current == "open":
        return {"data": exam}
    if current == "draft":
        _require(actor, VIEW_ROLES, "Only admins and head teachers can open an exam.")
    elif current == "closed":
        _require(actor, MANAGE_ROLES, "Only admins can reopen a closed exam.")
    else:
        raise HTTPException(
            status_code=400,
            detail={"error": f"Cannot open exam from status '{current}'.", "code": "INVALID_STATUS"},
        )

    actor_id = _actor_id(actor)
    await conn.execute(
        """
        UPDATE alevel_exams
        SET status = 'open',
            opened_at = NOW(),
            opened_by = $1,
            closed_at = NULL,
            closed_by = NULL,
            updated_at = NOW()
        WHERE id = $2 AND school_id = $3
        """,
        actor_id,
        exam_id,
        school_id,
    )
    return {"data": await require_exam(conn, school_id, exam_id)}


@router.post("/exams/{exam_id}/close")
async def close_exam(
    exam_id: uuid.UUID, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    """Close an open exam (blocks further grade entry)."""
    school_id, actor = ctx
    _require(actor, VIEW_ROLES, "Only admins and head teachers can close an exam.")
    exam = await require_exam(conn, school_id, exam_id)
    if exam["status"] == "closed":
        return {"data": exam}
    if exam["status"] != "open":
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Only an open exam can be closed.",
                "code": "INVALID_STATUS",
                "status": exam["status"],
            },
        )

    actor_id = _actor_id(actor)
    await conn.execute(
        """
        UPDATE alevel_exams
        SET status = 'closed',
            closed_at = NOW(),
            closed_by = $1,
            updated_at = NOW()
        WHERE id = $2 AND school_id = $3
        """,
        actor_id,
        exam_id,
        school_id,
    )
    return {"data": await require_exam(conn, school_id, exam_id)}


# ══════════════════════════════════════════════════════════════════════════════
# Grades
# ══════════════════════════════════════════════════════════════════════════════
class GradeEntry(BaseModel):
    studentId: uuid.UUID
    subjectId: uuid.UUID
    rawScore: float | None = None

    @field_validator("rawScore")
    @classmethod
    def score_range(cls, v: float | None) -> float | None:
        if v is None:
            return None
        if not (0 <= v <= 100):
            raise ValueError("rawScore must be between 0 and 100")
        return v


class GradesBulkBody(BaseModel):
    examId: uuid.UUID
    entries: list[GradeEntry]


async def _class_student_subjects(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    class_id: uuid.UUID,
    academic_year_id: uuid.UUID,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Return (students, subjects) that make up the grade grid for a class.

    Students are those enrolled for the year in that class; subjects are the
    union of their combination principals plus GP plus their chosen subsidiary.
    """
    enrollments = await conn.fetch(
        f"{ENROLLMENT_SELECT} WHERE e.school_id = $1 AND e.class_id = $2 "
        "AND e.academic_year_id = $3 AND e.is_active = true ORDER BY s.full_name",
        school_id,
        class_id,
        academic_year_id,
    )
    students = [_enrollment(e) for e in enrollments]

    combo_ids = list({str(e["combination_id"]) for e in enrollments})
    subsidiary_ids = [
        str(e["subsidiary_subject_id"])
        for e in enrollments
        if e["subsidiary_subject_id"]
    ]

    subject_map: dict[str, dict[str, Any]] = {}
    if combo_ids:
        principal_rows = await conn.fetch(
            f"""
            SELECT DISTINCT {SUBJECT_COLUMNS}
            FROM alevel_combination_subjects cs
            JOIN alevel_subjects s ON s.id = cs.subject_id
            JOIN school_subjects ss ON ss.id = s.school_subject_id
            WHERE cs.school_id = $1 AND cs.combination_id = ANY($2::uuid[])
            """,
            school_id,
            [uuid.UUID(c) for c in combo_ids],
        )
        for r in principal_rows:
            subject_map[str(r["id"])] = _subject(r)

    # GP (all schools) and any chosen subsidiaries.
    extra_rows = await conn.fetch(
        f"""
        SELECT {SUBJECT_COLUMNS}
        {SUBJECT_FROM}
        WHERE s.school_id = $1 AND (s.is_gp = true OR s.id = ANY($2::uuid[]))
        """,
        school_id,
        [uuid.UUID(s) for s in subsidiary_ids] if subsidiary_ids else [],
    )
    for r in extra_rows:
        subject_map[str(r["id"])] = _subject(r)

    subjects = sorted(
        subject_map.values(),
        key=lambda s: (0 if s["subjectType"] == "principal" else 1, s["name"]),
    )
    return students, subjects


@router.get("/grades")
async def get_grades(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    exam_id: uuid.UUID = Query(...),
):
    """Grade grid for an exam.

    Teachers: only their assigned subject columns and those marks; editable until submit.
    Admin / head teacher: full grid, always read-only (unlock teachers separately).
    """
    school_id, actor = ctx
    _require(actor, GRADE_ROLES, "You cannot access A-Level grades.")

    exam = await require_exam(conn, school_id, exam_id)
    class_id = uuid.UUID(exam["classId"])
    academic_year_id = uuid.UUID(exam["academicYearId"])
    actor_id = _actor_id(actor)
    role = actor["role"]

    students, all_subjects = await _class_student_subjects(
        conn, school_id, class_id, academic_year_id
    )

    editable_subject_ids: list[str] | None = None
    visible_subject_ids: set[str] | None = None
    is_submitted = False
    submitted_at: str | None = None
    can_edit = False
    submissions: list[dict[str, Any]] = []

    if role == "teacher":
        allowed = await assert_teacher_can_grade_class(
            conn, school_id, actor_id, class_id
        )
        editable_subject_ids = sorted(allowed)
        visible_subject_ids = set(allowed)
        submission = await fetch_teacher_submission(
            conn, school_id, exam_id, actor_id
        )
        is_submitted = bool(submission)
        submitted_at = submission["submittedAt"] if submission else None
        can_edit = exam["isOpen"] and not is_submitted
    else:
        # Admin / HT: view everything, never edit marks.
        can_edit = False
        submissions = await list_exam_submissions(conn, school_id, exam_id)

    subjects = (
        [s for s in all_subjects if s["id"] in visible_subject_ids]
        if visible_subject_ids is not None
        else all_subjects
    )
    subject_id_set = {s["id"] for s in subjects}

    grade_rows = await conn.fetch(
        """
        SELECT student_id, subject_id, raw_score, grade, points, entered_by
        FROM alevel_grades
        WHERE school_id = $1 AND exam_id = $2
        """,
        school_id,
        exam_id,
    )
    grades = {}
    for r in grade_rows:
        sid = str(r["subject_id"])
        if sid not in subject_id_set:
            continue
        # Teachers only see marks they entered (never another teacher's figures).
        if role == "teacher":
            entered_by = r["entered_by"]
            if entered_by is not None and entered_by != actor_id:
                continue
        grades[f"{r['student_id']}:{r['subject_id']}"] = {
            "rawScore": float(r["raw_score"]) if r["raw_score"] is not None else None,
            "grade": r["grade"],
            "points": r["points"],
        }

    return {
        "data": {
            "students": students,
            "subjects": subjects,
            "grades": grades,
            "examId": exam["id"],
            "examName": exam["name"],
            "examStatus": exam["status"],
            "isLocked": exam["isLocked"],
            "isOpen": exam["isOpen"],
            "editableSubjectIds": editable_subject_ids,
            "canEdit": can_edit,
            "isSubmitted": is_submitted,
            "submittedAt": submitted_at,
            "submissions": submissions,
            "readOnly": not can_edit,
        }
    }


@router.post("/grades/bulk")
async def save_grades(
    body: GradesBulkBody, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    """Teacher-only: save draft marks for assigned subjects while not yet submitted."""
    school_id, actor = ctx
    _require(
        actor,
        TEACHER_WRITE_ROLES,
        "Only teachers can enter marks. Admins and head teachers can view and unlock.",
    )
    actor_id = _actor_id(actor)

    exam = await assert_exam_open(conn, school_id, body.examId)
    class_id = uuid.UUID(exam["classId"])
    term_id = uuid.UUID(exam["termId"])
    academic_year_id = uuid.UUID(exam["academicYearId"])

    await assert_teacher_can_edit_marks(conn, school_id, body.examId, actor_id)
    allowed_subjects = await assert_teacher_can_grade_class(
        conn, school_id, actor_id, class_id
    )

    bands, threshold = await _load_grading_config(conn, school_id)
    subject_types = {
        str(r["id"]): r["subject_type"]
        for r in await conn.fetch(
            "SELECT id, subject_type FROM alevel_subjects WHERE school_id = $1",
            school_id,
        )
    }

    to_upsert: list[tuple[uuid.UUID, uuid.UUID, float, str, int]] = []
    to_delete: list[tuple[uuid.UUID, uuid.UUID]] = []
    skipped = 0

    for entry in body.entries:
        subject_key = str(entry.subjectId)
        subject_type = subject_types.get(subject_key)
        if subject_type is None:
            skipped += 1
            continue
        if subject_key not in allowed_subjects:
            skipped += 1
            continue
        if entry.rawScore is None:
            to_delete.append((entry.studentId, entry.subjectId))
            continue
        grade, points = compute_grade(entry.rawScore, subject_type, bands, threshold)
        to_upsert.append(
            (entry.studentId, entry.subjectId, entry.rawScore, grade, points)
        )

    async with conn.transaction():
        if to_delete:
            await conn.execute(
                """
                DELETE FROM alevel_grades g
                USING unnest($1::uuid[], $2::uuid[]) AS u(student_id, subject_id)
                WHERE g.school_id = $3
                  AND g.exam_id = $4
                  AND g.student_id = u.student_id
                  AND g.subject_id = u.subject_id
                """,
                [t[0] for t in to_delete],
                [t[1] for t in to_delete],
                school_id,
                body.examId,
            )
        if to_upsert:
            await conn.execute(
                """
                INSERT INTO alevel_grades
                  (school_id, student_id, subject_id, term_id, academic_year_id,
                   class_id, exam_id, raw_score, grade, points,
                   entered_by, entered_at, updated_at)
                SELECT
                  $1, u.student_id, u.subject_id, $2, $3, $4, $5,
                  u.raw_score, u.grade, u.points, $6, NOW(), NOW()
                FROM unnest(
                  $7::uuid[], $8::uuid[], $9::numeric[], $10::text[], $11::smallint[]
                ) AS u(student_id, subject_id, raw_score, grade, points)
                ON CONFLICT (school_id, student_id, subject_id, exam_id)
                DO UPDATE SET raw_score = EXCLUDED.raw_score,
                              grade = EXCLUDED.grade,
                              points = EXCLUDED.points,
                              class_id = EXCLUDED.class_id,
                              term_id = EXCLUDED.term_id,
                              academic_year_id = EXCLUDED.academic_year_id,
                              entered_by = EXCLUDED.entered_by,
                              updated_at = NOW()
                """,
                school_id,
                term_id,
                academic_year_id,
                class_id,
                body.examId,
                actor_id,
                [t[0] for t in to_upsert],
                [t[1] for t in to_upsert],
                [t[2] for t in to_upsert],
                [t[3] for t in to_upsert],
                [t[4] for t in to_upsert],
            )

    return {
        "data": {
            "saved": len(to_upsert),
            "cleared": len(to_delete),
            "skipped": skipped,
        }
    }


@router.post("/exams/{exam_id}/submit")
async def submit_marks(
    exam_id: uuid.UUID, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    """Teacher submits marks for this exam — locks their subjects until unlocked."""
    school_id, actor = ctx
    _require(actor, TEACHER_WRITE_ROLES, "Only teachers can submit marks.")
    actor_id = _actor_id(actor)

    exam = await assert_exam_open(conn, school_id, exam_id)
    class_id = uuid.UUID(exam["classId"])
    await assert_teacher_can_grade_class(conn, school_id, actor_id, class_id)

    existing = await fetch_teacher_submission(conn, school_id, exam_id, actor_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "You have already submitted marks for this exam.",
                "code": "ALREADY_SUBMITTED",
                **existing,
            },
        )

    has_marks = await conn.fetchval(
        """
        SELECT 1 FROM alevel_grades g
        JOIN alevel_subjects als ON als.id = g.subject_id
        JOIN teacher_class_assignments tca
          ON tca.subject_id = als.school_subject_id
         AND tca.school_id = g.school_id
         AND tca.class_id = g.class_id
         AND tca.teacher_id = $3
        WHERE g.school_id = $1 AND g.exam_id = $2
        LIMIT 1
        """,
        school_id,
        exam_id,
        actor_id,
    )
    if not has_marks:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Save at least one mark before submitting.",
                "code": "NO_MARKS",
            },
        )

    await conn.execute(
        """
        INSERT INTO alevel_mark_submissions (school_id, exam_id, teacher_id, submitted_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (school_id, exam_id, teacher_id) DO NOTHING
        """,
        school_id,
        exam_id,
        actor_id,
    )
    submission = await fetch_teacher_submission(conn, school_id, exam_id, actor_id)
    return {"data": {"ok": True, **(submission or {"isSubmitted": True})}}


@router.get("/exams/{exam_id}/submissions")
async def get_exam_submissions(
    exam_id: uuid.UUID, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    _require(actor, VIEW_ROLES, "Only admins and head teachers can view submissions.")
    await require_exam(conn, school_id, exam_id)
    return {"data": await list_exam_submissions(conn, school_id, exam_id)}


@router.post("/exams/{exam_id}/submissions/{teacher_id}/unlock")
async def unlock_teacher_submission(
    exam_id: uuid.UUID,
    teacher_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    """Allow a teacher to edit and resubmit marks after they had locked them."""
    school_id, actor = ctx
    _require(actor, VIEW_ROLES, "Only admins and head teachers can unlock marks.")
    await require_exam(conn, school_id, exam_id)
    actor_id = _actor_id(actor)

    deleted = await conn.fetchval(
        """
        DELETE FROM alevel_mark_submissions
        WHERE school_id = $1 AND exam_id = $2 AND teacher_id = $3
        RETURNING id
        """,
        school_id,
        exam_id,
        teacher_id,
    )
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "No submitted marks found for this teacher on this exam.",
                "code": "NOT_SUBMITTED",
            },
        )
    return {
        "data": {
            "ok": True,
            "teacherId": str(teacher_id),
            "unlockedBy": str(actor_id),
        }
    }


# ══════════════════════════════════════════════════════════════════════════════
# Results
# ══════════════════════════════════════════════════════════════════════════════
@router.get("/results")
async def get_results(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    exam_id: uuid.UUID = Query(...),
):
    school_id, actor = ctx
    _require(actor, VIEW_ROLES, "You cannot view A-Level results.")

    exam = await require_exam(conn, school_id, exam_id)
    class_id = uuid.UUID(exam["classId"])
    academic_year_id = uuid.UUID(exam["academicYearId"])

    students, subjects = await _class_student_subjects(
        conn, school_id, class_id, academic_year_id
    )
    subject_type_by_id = {s["id"]: s for s in subjects}

    grade_rows = await conn.fetch(
        """
        SELECT student_id, subject_id, raw_score, grade, points
        FROM alevel_grades
        WHERE school_id = $1 AND exam_id = $2
        """,
        school_id,
        exam_id,
    )
    by_student: dict[str, list[dict[str, Any]]] = {}
    for r in grade_rows:
        subj = subject_type_by_id.get(str(r["subject_id"]))
        if not subj:
            continue
        by_student.setdefault(str(r["student_id"]), []).append(
            {
                "subjectId": str(r["subject_id"]),
                "subjectName": subj["name"],
                "subjectType": subj["subjectType"],
                "isGp": subj["isGp"],
                "rawScore": float(r["raw_score"]) if r["raw_score"] is not None else None,
                "grade": r["grade"],
                "points": r["points"],
            }
        )

    results = []
    for student in students:
        student_grades = by_student.get(student["studentId"], [])
        totals = compute_student_totals(student_grades)
        results.append(
            {
                "studentId": student["studentId"],
                "studentName": student["studentName"],
                "learnerId": student["learnerId"],
                "combinationName": student["combinationName"],
                "className": student["className"],
                "subjects": student_grades,
                **totals,
            }
        )

    results.sort(
        key=lambda r: (-r["total_points"], (r["studentName"] or "").lower())
    )
    for rank, result in enumerate(results, start=1):
        result["position"] = rank

    n = len(results)
    avg_points = (
        round(sum(r["total_points"] for r in results) / n, 2) if n else 0.0
    )
    cert = sum(1 for r in results if r["result_code"] == "1")
    three_pass = sum(1 for r in results if r["principal_pass_count"] >= 3)
    two_pass = sum(1 for r in results if r["principal_pass_count"] >= 2)

    subject_stats = []
    for subj in subjects:
        sat = 0
        passed = 0
        points_sum = 0
        for r in results:
            cell = next(
                (s for s in r["subjects"] if s["subjectId"] == subj["id"]), None
            )
            if not cell or cell.get("grade") is None:
                continue
            sat += 1
            points_sum += int(cell.get("points") or 0)
            g = cell.get("grade") or ""
            if subj["subjectType"] == "principal":
                if g in PRINCIPAL_PASS_GRADES:
                    passed += 1
            elif g == "P":
                passed += 1
        subject_stats.append(
            {
                "subjectId": subj["id"],
                "subjectName": subj["name"],
                "code": subj["code"],
                "sat": sat,
                "passRate": round((passed / sat) * 100, 1) if sat else 0.0,
                "averagePoints": round(points_sum / sat, 2) if sat else 0.0,
            }
        )
    subject_stats.sort(key=lambda s: s["passRate"], reverse=True)

    return {
        "data": {
            "examId": exam["id"],
            "examName": exam["name"],
            "examStatus": exam["status"],
            "results": results,
            "subjects": subjects,
            "summary": {
                "studentCount": n,
                "averagePoints": avg_points,
                "certificateEligible": cert,
                "certificateEligiblePercent": round((cert / n) * 100, 1) if n else 0.0,
                "threePrincipalPasses": three_pass,
                "twoPrincipalPasses": two_pass,
                "subjectStats": subject_stats,
            },
        }
    }


# ══════════════════════════════════════════════════════════════════════════════
# Enrollment updates (single + bulk)
# ══════════════════════════════════════════════════════════════════════════════
class EnrollmentUpdateBody(BaseModel):
    combinationId: uuid.UUID | None = None
    subsidiarySubjectId: uuid.UUID | None = None
    isActive: bool | None = None


class BulkEnrollmentUpdateBody(BaseModel):
    enrollmentIds: list[uuid.UUID]
    combinationId: uuid.UUID | None = None
    subsidiarySubjectId: uuid.UUID | None = None
    isActive: bool | None = None

    @field_validator("enrollmentIds")
    @classmethod
    def ids_ok(cls, v: list[uuid.UUID]) -> list[uuid.UUID]:
        unique = list(dict.fromkeys(v))
        if not unique:
            raise ValueError("Select at least one enrollment")
        if len(unique) > 300:
            raise ValueError("Update at most 300 enrollments at a time")
        return unique


@router.patch("/enrollments/{enrollment_id}")
async def update_enrollment(
    enrollment_id: uuid.UUID,
    body: EnrollmentUpdateBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    _require(actor, MANAGE_ROLES, "Only admins can manage enrollments.")

    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status_code=400, detail={"error": "Provide at least one field to update."}
        )

    if body.combinationId is not None:
        ok = await conn.fetchval(
            "SELECT 1 FROM alevel_combinations WHERE id = $1 AND school_id = $2",
            body.combinationId,
            school_id,
        )
        if not ok:
            raise HTTPException(status_code=400, detail={"error": "Invalid combination."})
    if "subsidiarySubjectId" in updates and body.subsidiarySubjectId is not None:
        ok = await conn.fetchval(
            """
            SELECT 1 FROM alevel_subjects
            WHERE id = $1 AND school_id = $2 AND subject_type = 'subsidiary' AND is_gp = false
            """,
            body.subsidiarySubjectId,
            school_id,
        )
        if not ok:
            raise HTTPException(
                status_code=400, detail={"error": "Invalid subsidiary subject."}
            )

    set_parts: list[str] = []
    params: list[Any] = []
    idx = 1
    if "combinationId" in updates:
        set_parts.append(f"combination_id = ${idx}")
        params.append(body.combinationId)
        idx += 1
    if "subsidiarySubjectId" in updates:
        set_parts.append(f"subsidiary_subject_id = ${idx}")
        params.append(body.subsidiarySubjectId)
        idx += 1
    if "isActive" in updates:
        set_parts.append(f"is_active = ${idx}")
        params.append(body.isActive)
        idx += 1

    params.extend([enrollment_id, school_id])
    row = await conn.fetchrow(
        f"""
        UPDATE alevel_enrollments
        SET {", ".join(set_parts)}
        WHERE id = ${idx} AND school_id = ${idx + 1}
        RETURNING id
        """,
        *params,
    )
    if not row:
        raise HTTPException(status_code=404, detail={"error": "Enrollment not found"})
    full = await conn.fetchrow(f"{ENROLLMENT_SELECT} WHERE e.id = $1", enrollment_id)
    return {"data": _enrollment(full)}


@router.post("/enrollments/bulk-update")
async def bulk_update_enrollments(
    body: BulkEnrollmentUpdateBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    """Bulk-change combination, subsidiary, and/or active flag for many enrollments."""
    school_id, actor = ctx
    _require(actor, MANAGE_ROLES, "Only admins can manage enrollments.")

    updates = body.model_dump(exclude_unset=True)
    updates.pop("enrollmentIds", None)
    if not updates:
        raise HTTPException(
            status_code=400,
            detail={"error": "Provide at least one field to update."},
        )

    if body.combinationId is not None:
        ok = await conn.fetchval(
            "SELECT 1 FROM alevel_combinations WHERE id = $1 AND school_id = $2",
            body.combinationId,
            school_id,
        )
        if not ok:
            raise HTTPException(status_code=400, detail={"error": "Invalid combination."})
    if "subsidiarySubjectId" in updates and body.subsidiarySubjectId is not None:
        ok = await conn.fetchval(
            """
            SELECT 1 FROM alevel_subjects
            WHERE id = $1 AND school_id = $2 AND subject_type = 'subsidiary' AND is_gp = false
            """,
            body.subsidiarySubjectId,
            school_id,
        )
        if not ok:
            raise HTTPException(
                status_code=400, detail={"error": "Invalid subsidiary subject."}
            )

    set_parts: list[str] = []
    params: list[Any] = []
    idx = 1
    if "combinationId" in updates:
        set_parts.append(f"combination_id = ${idx}")
        params.append(body.combinationId)
        idx += 1
    if "subsidiarySubjectId" in updates:
        set_parts.append(f"subsidiary_subject_id = ${idx}")
        params.append(body.subsidiarySubjectId)
        idx += 1
    if "isActive" in updates:
        set_parts.append(f"is_active = ${idx}")
        params.append(body.isActive)
        idx += 1

    params.extend([school_id, body.enrollmentIds])
    await conn.execute(
        f"""
        UPDATE alevel_enrollments
        SET {", ".join(set_parts)}
        WHERE school_id = ${idx} AND id = ANY(${idx + 1}::uuid[])
        """,
        *params,
    )
    count = await conn.fetchval(
        """
        SELECT COUNT(*)::int FROM alevel_enrollments
        WHERE school_id = $1 AND id = ANY($2::uuid[])
        """,
        school_id,
        body.enrollmentIds,
    )
    return {"data": {"updated": int(count or 0)}}


# ══════════════════════════════════════════════════════════════════════════════
# Student grades + report cards
# ══════════════════════════════════════════════════════════════════════════════
@router.get("/grades/student/{student_id}")
async def get_student_grades(
    student_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    academic_year_id: uuid.UUID = Query(...),
):
    school_id, actor = ctx
    _require(actor, VIEW_ROLES | GRADE_ROLES, "You cannot view student grades.")

    terms = await conn.fetch(
        """
        SELECT id, name FROM terms
        WHERE school_id = $1 AND academic_year_id = $2
        ORDER BY start_date ASC NULLS LAST, name ASC
        """,
        school_id,
        academic_year_id,
    )
    exam_rows = await conn.fetch(
        f"""
        {EXAM_SELECT}
        WHERE e.school_id = $1 AND e.academic_year_id = $2
        ORDER BY t.start_date ASC NULLS LAST, et.sort_order ASC, e.created_at ASC
        """,
        school_id,
        academic_year_id,
    )
    grade_rows = await conn.fetch(
        f"""
        SELECT g.exam_id, g.raw_score, g.grade, g.points,
               {SUBJECT_COLUMNS}
        FROM alevel_grades g
        JOIN alevel_subjects s ON s.id = g.subject_id
        JOIN school_subjects ss ON ss.id = s.school_subject_id
        WHERE g.school_id = $1 AND g.student_id = $2 AND g.academic_year_id = $3
        """,
        school_id,
        student_id,
        academic_year_id,
    )
    by_exam: dict[str, list[dict[str, Any]]] = {}
    for r in grade_rows:
        by_exam.setdefault(str(r["exam_id"]), []).append(
            {
                "subjectId": str(r["id"]),
                "subjectName": r["name"],
                "subjectType": r["subject_type"],
                "isGp": r["is_gp"],
                "rawScore": float(r["raw_score"]) if r["raw_score"] is not None else None,
                "grade": r["grade"],
                "points": r["points"],
                "descriptor": grade_descriptor(r["grade"], r["subject_type"]),
            }
        )

    exams_by_term: dict[str, list[dict[str, Any]]] = {}
    for er in exam_rows:
        exam = _serialize_exam(er)
        subjects = by_exam.get(exam["id"], [])
        exams_by_term.setdefault(exam["termId"], []).append(
            {
                "examId": exam["id"],
                "examName": exam["name"],
                "examTypeName": exam.get("examTypeName"),
                "examStatus": exam["status"],
                "subjects": subjects,
                **compute_student_totals(subjects),
            }
        )

    payload = []
    for t in terms:
        tid = str(t["id"])
        payload.append(
            {
                "termId": tid,
                "termName": t["name"],
                "exams": exams_by_term.get(tid, []),
            }
        )
    return {"data": {"studentId": str(student_id), "terms": payload}}


@router.get("/report-card/{student_id}")
async def get_report_card(
    student_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    exam_id: uuid.UUID = Query(...),
):
    school_id, actor = ctx
    _require(actor, VIEW_ROLES, "You cannot view report cards.")

    from app.lib.alevel_reports import build_report_card_data

    data = await build_report_card_data(
        conn, school_id, student_id, exam_id, for_pdf=False
    )
    return {"data": data}


class ReportCommentBody(BaseModel):
    classTeacherComment: str | None = None
    headTeacherComment: str | None = None
    approve: bool = False


class BulkReportCommentBody(BaseModel):
    examId: uuid.UUID
    studentIds: list[uuid.UUID]
    classTeacherComment: str | None = None
    headTeacherComment: str | None = None
    approve: bool = False


async def _upsert_report_comment(
    conn: asyncpg.Connection,
    *,
    school_id: uuid.UUID,
    student_id: uuid.UUID,
    exam: dict[str, Any],
    class_teacher_comment: str | None,
    head_teacher_comment: str | None,
    approve: bool,
    actor_id: uuid.UUID,
) -> None:
    """Insert or update report metadata. Pass comments as None to leave unchanged."""
    term_id = uuid.UUID(exam["termId"])
    academic_year_id = uuid.UUID(exam["academicYearId"])
    class_id = uuid.UUID(exam["classId"])
    exam_id = uuid.UUID(exam["id"])
    approved_by: uuid.UUID | None = actor_id if approve else None

    await conn.execute(
        """
        INSERT INTO alevel_report_metadata
          (school_id, student_id, term_id, academic_year_id, class_id, exam_id,
           class_teacher_comment, head_teacher_comment,
           approved_by, approved_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::uuid,
                CASE WHEN $9::uuid IS NOT NULL THEN NOW() ELSE NULL END,
                NOW())
        ON CONFLICT (school_id, student_id, exam_id)
        DO UPDATE SET
          class_teacher_comment = COALESCE(
            EXCLUDED.class_teacher_comment, alevel_report_metadata.class_teacher_comment
          ),
          head_teacher_comment = COALESCE(
            EXCLUDED.head_teacher_comment, alevel_report_metadata.head_teacher_comment
          ),
          class_id = COALESCE(EXCLUDED.class_id, alevel_report_metadata.class_id),
          approved_by = COALESCE(
            EXCLUDED.approved_by, alevel_report_metadata.approved_by
          ),
          approved_at = COALESCE(
            EXCLUDED.approved_at, alevel_report_metadata.approved_at
          ),
          updated_at = NOW()
        """,
        school_id,
        student_id,
        term_id,
        academic_year_id,
        class_id,
        exam_id,
        class_teacher_comment,
        head_teacher_comment,
        approved_by,
    )


@router.post("/report-card/{student_id}/comment")
async def save_report_comment(
    student_id: uuid.UUID,
    body: ReportCommentBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    exam_id: uuid.UUID = Query(...),
):
    school_id, actor = ctx
    _require(actor, VIEW_ROLES, "You cannot edit report comments.")
    actor_id = _actor_id(actor)

    exam = await require_exam(conn, school_id, exam_id)

    existing = await conn.fetchrow(
        """
        SELECT approved_at FROM alevel_report_metadata
        WHERE school_id = $1 AND student_id = $2 AND exam_id = $3
        """,
        school_id,
        student_id,
        exam_id,
    )
    if existing and existing["approved_at"] and not body.approve:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "This report card is approved. Comments are locked.",
                "code": "APPROVED",
            },
        )

    if body.approve and actor["role"] not in {"head_teacher", "admin"}:
        raise HTTPException(
            status_code=403,
            detail={"error": "Only the head teacher or admin can approve."},
        )

    await _upsert_report_comment(
        conn,
        school_id=school_id,
        student_id=student_id,
        exam=exam,
        class_teacher_comment=body.classTeacherComment,
        head_teacher_comment=body.headTeacherComment,
        approve=body.approve,
        actor_id=actor_id,
    )
    return {"data": {"ok": True, "approved": body.approve}}


@router.post("/report-cards/comments/bulk")
async def bulk_save_report_comments(
    body: BulkReportCommentBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    """Apply the same comment(s) to multiple students for one exam."""
    school_id, actor = ctx
    _require(actor, VIEW_ROLES, "You cannot edit report comments.")
    actor_id = _actor_id(actor)

    if not body.studentIds:
        raise HTTPException(
            status_code=400,
            detail={"error": "Select at least one student.", "code": "EMPTY"},
        )
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

    if body.approve and actor["role"] not in {"head_teacher", "admin"}:
        raise HTTPException(
            status_code=403,
            detail={"error": "Only the head teacher or admin can approve."},
        )

    exam = await require_exam(conn, school_id, body.examId)
    class_id = uuid.UUID(exam["classId"])
    academic_year_id = uuid.UUID(exam["academicYearId"])

    enrolled, _ = await _class_student_subjects(
        conn, school_id, class_id, academic_year_id
    )
    enrolled_ids = {s["studentId"] for s in enrolled}

    approved_rows = await conn.fetch(
        """
        SELECT student_id FROM alevel_report_metadata
        WHERE school_id = $1 AND exam_id = $2 AND approved_at IS NOT NULL
        """,
        school_id,
        body.examId,
    )
    already_approved = {str(r["student_id"]) for r in approved_rows}

    saved = 0
    skipped_approved = 0
    skipped_not_enrolled = 0

    for sid in body.studentIds:
        sid_str = str(sid)
        if sid_str not in enrolled_ids:
            skipped_not_enrolled += 1
            continue
        if sid_str in already_approved and not body.approve:
            skipped_approved += 1
            continue
        await _upsert_report_comment(
            conn,
            school_id=school_id,
            student_id=sid,
            exam=exam,
            class_teacher_comment=body.classTeacherComment,
            head_teacher_comment=body.headTeacherComment,
            approve=body.approve,
            actor_id=actor_id,
        )
        saved += 1

    return {
        "data": {
            "saved": saved,
            "skippedApproved": skipped_approved,
            "skippedNotEnrolled": skipped_not_enrolled,
        }
    }


@router.post("/report-cards/generate")
async def generate_report_cards(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    exam_id: uuid.UUID = Query(...),
    student_id: uuid.UUID | None = Query(None),
):
    """Generate PDF report card(s). Returns binary PDF or ZIP.

    Class ZIPs build PDFs in parallel (separate pool connections) so the
    request finishes before Next.js rewrite proxies time out.
    """
    import asyncio
    import io
    import zipfile

    from app.db.pool import get_pool
    from app.lib.alevel_pdf import generate_alevel_report_pdf_bytes
    from app.lib.alevel_reports import (
        build_report_card_data,
        compute_exam_ranks,
        load_school_branding,
    )

    school_id, actor = ctx
    _require(actor, VIEW_ROLES, "You cannot generate report cards.")

    exam = await require_exam(conn, school_id, exam_id)
    class_id = uuid.UUID(exam["classId"])
    academic_year_id = uuid.UUID(exam["academicYearId"])

    students, _ = await _class_student_subjects(
        conn, school_id, class_id, academic_year_id
    )
    targets = (
        [s for s in students if s["studentId"] == str(student_id)]
        if student_id
        else students
    )
    if not targets:
        raise HTTPException(status_code=404, detail={"error": "No students found."})

    branding = await load_school_branding(conn, school_id, for_pdf=True)
    ranks, class_size = await compute_exam_ranks(
        conn, school_id, exam_id, students
    )

    # Cap concurrency so we do not exhaust the DB pool (max_size=20).
    sem = asyncio.Semaphore(min(4, max(1, len(targets))))
    pool = await get_pool()

    async def one(s: dict[str, Any]) -> tuple[str, bytes]:
        sid = uuid.UUID(s["studentId"])
        async with sem:
            async with pool.acquire() as worker:
                data = await build_report_card_data(
                    worker,
                    school_id,
                    sid,
                    exam_id,
                    for_pdf=True,
                    branding=branding,
                    ranks=ranks,
                    class_size=class_size,
                    classmates=students,
                )
                pdf = await generate_alevel_report_pdf_bytes(data)
                safe_learner = (data.get("learnerId") or s["studentId"]).replace(
                    " ", "_"
                )
                # Unique zip entry even when learner IDs collide / are blank.
                name = f"{safe_learner}-{str(sid)[:8]}-report.pdf"
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
            "Content-Disposition": 'attachment; filename="alevel-report-cards.zip"',
            "Content-Length": str(len(payload)),
            "Cache-Control": "no-store",
        },
    )

