"""Traditional UACE A-Level module.

Subjects, combinations, student enrollments, termly grade entry, and computed
results. Grading logic lives in app.lib.alevel (pure, tested separately).
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any, Optional

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, field_validator

from app.db.pool import get_db
from app.lib.alevel import (
    PRINCIPAL_BANDS,
    SUBSIDIARY_PASS_THRESHOLD,
    compute_grade,
    compute_student_totals,
)
from app.lib.teacher_assignments import format_class_name
from app.middleware.subscription_guard import require_tenant_with_subscription

router = APIRouter()

TenantCtx = Annotated[
    tuple[uuid.UUID, dict[str, Any]],
    Depends(require_tenant_with_subscription),
]

MANAGE_ROLES = {"admin"}
VIEW_ROLES = {"admin", "head_teacher"}
GRADE_ROLES = {"admin", "head_teacher", "teacher"}

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
# Selector context: terms (each carrying its academic year)
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
    _require(actor, VIEW_ROLES, "You cannot view the grading scale.")
    bands, threshold = await _load_grading_config(conn, school_id)
    return {
        "data": {
            "bands": [
                {"minScore": b[0], "grade": b[1], "points": b[2]}
                for b in sorted(bands, key=lambda x: x[0], reverse=True)
            ],
            "subsidiaryPassThreshold": threshold,
        }
    }


@router.put("/grading-scale")
async def put_grading_scale(
    body: GradingScaleBody, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    _require(actor, MANAGE_ROLES, "Only admins can configure the grading scale.")

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

    return {"data": {"ok": True}}


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
):
    school_id, actor = ctx
    _require(actor, GRADE_ROLES | VIEW_ROLES, "You cannot access A-Level enrollments.")
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
    termId: uuid.UUID
    academicYearId: uuid.UUID
    classId: uuid.UUID
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
    class_id: uuid.UUID = Query(...),
    term_id: uuid.UUID = Query(...),
    academic_year_id: uuid.UUID = Query(...),
):
    school_id, actor = ctx
    _require(actor, GRADE_ROLES, "You cannot access A-Level grades.")

    students, subjects = await _class_student_subjects(
        conn, school_id, class_id, academic_year_id
    )

    grade_rows = await conn.fetch(
        """
        SELECT student_id, subject_id, raw_score, grade, points
        FROM alevel_grades
        WHERE school_id = $1 AND class_id = $2 AND term_id = $3
        """,
        school_id,
        class_id,
        term_id,
    )
    grades = {
        f"{r['student_id']}:{r['subject_id']}": {
            "rawScore": float(r["raw_score"]) if r["raw_score"] is not None else None,
            "grade": r["grade"],
            "points": r["points"],
        }
        for r in grade_rows
    }

    return {
        "data": {
            "students": students,
            "subjects": subjects,
            "grades": grades,
        }
    }


@router.post("/grades/bulk")
async def save_grades(
    body: GradesBulkBody, ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)
):
    school_id, actor = ctx
    _require(actor, GRADE_ROLES, "You cannot enter A-Level grades.")
    actor_id = _actor_id(actor)

    bands, threshold = await _load_grading_config(conn, school_id)

    subject_types = {
        str(r["id"]): r["subject_type"]
        for r in await conn.fetch(
            "SELECT id, subject_type FROM alevel_subjects WHERE school_id = $1",
            school_id,
        )
    }

    saved = 0
    async with conn.transaction():
        for entry in body.entries:
            subject_type = subject_types.get(str(entry.subjectId))
            if subject_type is None:
                continue
            if entry.rawScore is None:
                await conn.execute(
                    """
                    DELETE FROM alevel_grades
                    WHERE school_id = $1 AND student_id = $2 AND subject_id = $3 AND term_id = $4
                    """,
                    school_id,
                    entry.studentId,
                    entry.subjectId,
                    body.termId,
                )
                continue
            grade, points = compute_grade(
                entry.rawScore, subject_type, bands, threshold
            )
            await conn.execute(
                """
                INSERT INTO alevel_grades
                  (school_id, student_id, subject_id, term_id, academic_year_id,
                   class_id, raw_score, grade, points, entered_by, entered_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
                ON CONFLICT (school_id, student_id, subject_id, term_id)
                DO UPDATE SET raw_score = EXCLUDED.raw_score,
                              grade = EXCLUDED.grade,
                              points = EXCLUDED.points,
                              class_id = EXCLUDED.class_id,
                              academic_year_id = EXCLUDED.academic_year_id,
                              entered_by = EXCLUDED.entered_by,
                              updated_at = NOW()
                """,
                school_id,
                entry.studentId,
                entry.subjectId,
                body.termId,
                body.academicYearId,
                body.classId,
                entry.rawScore,
                grade,
                points,
                actor_id,
            )
            saved += 1

    return {"data": {"saved": saved}}


# ══════════════════════════════════════════════════════════════════════════════
# Results
# ══════════════════════════════════════════════════════════════════════════════
@router.get("/results")
async def get_results(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    class_id: uuid.UUID = Query(...),
    term_id: uuid.UUID = Query(...),
    academic_year_id: uuid.UUID = Query(...),
):
    school_id, actor = ctx
    _require(actor, VIEW_ROLES, "You cannot view A-Level results.")

    students, subjects = await _class_student_subjects(
        conn, school_id, class_id, academic_year_id
    )
    subject_type_by_id = {s["id"]: s for s in subjects}

    grade_rows = await conn.fetch(
        """
        SELECT student_id, subject_id, raw_score, grade, points
        FROM alevel_grades
        WHERE school_id = $1 AND class_id = $2 AND term_id = $3
        """,
        school_id,
        class_id,
        term_id,
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

    results.sort(key=lambda r: r["total_points"], reverse=True)
    for rank, result in enumerate(results, start=1):
        result["position"] = rank

    return {
        "data": {
            "results": results,
            "subjects": subjects,
        }
    }
