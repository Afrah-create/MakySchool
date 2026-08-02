from __future__ import annotations

import uuid
from typing import Any

import asyncpg
from fastapi import HTTPException

from . import serialize

LOWER_LEVELS = ["S1", "S2"]
UPPER_LEVELS = ["S3", "S4"]
VALID_ROLES = {"compulsory", "optional", "co_curricular"}


async def list_subjects(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    is_active: bool | None = None,
    department: str | None = None,
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT * FROM olevel_subjects
        WHERE school_id = $1
          AND ($2::boolean IS NULL OR is_active = $2)
          AND ($3::text IS NULL OR department = $3)
        ORDER BY name
        """,
        school_id,
        is_active,
        department,
    )
    return [serialize.subject(r) for r in rows]


async def create_subject(
    conn: asyncpg.Connection, school_id: uuid.UUID, payload: dict[str, Any]
) -> dict[str, Any]:
    name = payload["name"].strip()
    ss = await conn.fetchval(
        "SELECT id FROM school_subjects WHERE school_id=$1 AND LOWER(name)=LOWER($2)",
        school_id,
        name,
    )
    if not ss:
        ss = await conn.fetchval(
            "INSERT INTO school_subjects(school_id,name) VALUES($1,$2) RETURNING id",
            school_id,
            name,
        )
    r = await conn.fetchrow(
        """
        INSERT INTO olevel_subjects(
          school_id, school_subject_id, name, code, abbreviation, department
        ) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
        """,
        school_id,
        ss,
        name,
        payload["code"].strip().upper(),
        payload.get("abbreviation"),
        payload.get("department"),
    )
    return serialize.subject(r)


async def patch_subject(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    subject_id: uuid.UUID,
    payload: dict[str, Any],
) -> dict[str, Any]:
    if "code" in payload and await conn.fetchval(
        "SELECT 1 FROM olevel_marks WHERE school_id=$1 AND subject_id=$2",
        school_id,
        subject_id,
    ):
        raise HTTPException(
            409,
            detail={
                "error": "Cannot change a subject code after marks exist.",
                "code": "SUBJECT_HAS_MARKS",
            },
        )
    r = await conn.fetchrow(
        """
        UPDATE olevel_subjects SET
          name = COALESCE($3, name),
          code = COALESCE($4, code),
          abbreviation = COALESCE($5, abbreviation),
          department = COALESCE($6, department),
          is_active = COALESCE($7, is_active),
          updated_at = NOW()
        WHERE id = $1 AND school_id = $2
        RETURNING *
        """,
        subject_id,
        school_id,
        payload.get("name"),
        payload.get("code"),
        payload.get("abbreviation"),
        payload.get("department"),
        payload.get("is_active"),
    )
    if not r:
        raise LookupError("Subject not found.")
    return serialize.subject(r)


async def list_curriculum_subjects(
    conn: asyncpg.Connection, school_id: uuid.UUID, curriculum_id: uuid.UUID
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT cs.*, os.name, os.code, os.abbreviation, os.department, os.school_subject_id
        FROM curriculum_subjects cs
        JOIN olevel_subjects os ON os.id = cs.subject_id
        JOIN curricula c ON c.id = cs.curriculum_id
        WHERE cs.curriculum_id = $1 AND c.school_id = $2
        ORDER BY cs.display_order, os.name
        """,
        curriculum_id,
        school_id,
    )
    return [serialize.curriculum_subject(r) for r in rows]


async def assign_curriculum_subject(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    curriculum_id: uuid.UUID,
    payload: dict[str, Any],
) -> dict[str, Any]:
    subject_id = uuid.UUID(str(payload.get("subject_id") or payload.get("subjectId")))
    role = payload.get("subject_role") or payload.get("subjectRole")
    levels = payload.get("applies_to_levels") or payload.get("appliesToLevels")
    order = payload.get("display_order", payload.get("displayOrder", 0))
    r = await conn.fetchrow(
        """
        INSERT INTO curriculum_subjects(
          curriculum_id, subject_id, subject_role, applies_to_levels, display_order
        )
        SELECT $1, $2, $3, $4, $5
        WHERE EXISTS (SELECT 1 FROM curricula WHERE id = $1 AND school_id = $6)
        RETURNING *
        """,
        curriculum_id,
        subject_id,
        role,
        levels,
        order,
        school_id,
    )
    if not r:
        raise LookupError("Curriculum or subject not found.")
    os_row = await conn.fetchrow(
        """
        SELECT cs.*, os.name, os.code, os.abbreviation, os.department, os.school_subject_id
        FROM curriculum_subjects cs
        JOIN olevel_subjects os ON os.id = cs.subject_id
        WHERE cs.id = $1
        """,
        r["id"],
    )
    return serialize.curriculum_subject(os_row)


async def update_curriculum_subject(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    curriculum_id: uuid.UUID,
    subject_id: uuid.UUID,
    payload: dict[str, Any],
) -> dict[str, Any]:
    r = await conn.fetchrow(
        """
        UPDATE curriculum_subjects cs
        SET subject_role = COALESCE($4, subject_role),
            applies_to_levels = COALESCE($5, applies_to_levels),
            display_order = COALESCE($6, display_order),
            is_active = COALESCE($7, is_active)
        FROM curricula c
        WHERE cs.curriculum_id = $1
          AND cs.subject_id = $2
          AND c.id = cs.curriculum_id
          AND c.school_id = $3
        RETURNING cs.*
        """,
        curriculum_id,
        subject_id,
        school_id,
        payload.get("subject_role", payload.get("subjectRole")),
        payload.get("applies_to_levels", payload.get("appliesToLevels")),
        payload.get("display_order", payload.get("displayOrder")),
        payload.get("is_active", payload.get("isActive")),
    )
    if not r:
        raise LookupError("Curriculum subject not found.")
    os_row = await conn.fetchrow(
        """
        SELECT cs.*, os.name, os.code, os.abbreviation, os.department, os.school_subject_id
        FROM curriculum_subjects cs
        JOIN olevel_subjects os ON os.id = cs.subject_id
        WHERE cs.id = $1
        """,
        r["id"],
    )
    return serialize.curriculum_subject(os_row)


async def remove_curriculum_subject(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    curriculum_id: uuid.UUID,
    subject_id: uuid.UUID,
) -> None:
    if await conn.fetchval(
        """
        SELECT 1 FROM student_subject_registrations r
        JOIN student_curriculum_enrollments e ON e.id = r.enrollment_id
        WHERE e.curriculum_id = $1 AND r.subject_id = $2
        """,
        curriculum_id,
        subject_id,
    ):
        raise HTTPException(
            409,
            detail={
                "error": "Students have registered this subject.",
                "code": "SUBJECT_REGISTERED",
            },
        )
    await conn.execute(
        "DELETE FROM curriculum_subjects WHERE curriculum_id=$1 AND subject_id=$2",
        curriculum_id,
        subject_id,
    )


def _normalize_band_levels(levels: list[str] | None) -> list[str]:
    values = [str(x).strip().upper() for x in (levels or []) if str(x).strip()]
    if set(values) == set(LOWER_LEVELS):
        return list(LOWER_LEVELS)
    if set(values) == set(UPPER_LEVELS):
        return list(UPPER_LEVELS)
    raise HTTPException(
        422,
        detail={
            "error": "Level band must be S1–S2 or S3–S4.",
            "code": "INVALID_LEVEL_BAND",
        },
    )


def _ordered_levels(levels: set[str]) -> list[str]:
    return [lv for lv in LOWER_LEVELS + UPPER_LEVELS if lv in levels]


async def replace_band_subjects(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    curriculum_id: uuid.UUID,
    *,
    levels: list[str],
    subjects: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Replace subject roles for one level band without disturbing the other band."""
    band = _normalize_band_levels(levels)
    band_set = set(band)

    if not await conn.fetchval(
        "SELECT 1 FROM curricula WHERE id=$1 AND school_id=$2",
        curriculum_id,
        school_id,
    ):
        raise LookupError("Curriculum not found.")

    desired: dict[uuid.UUID, str] = {}
    for raw in subjects:
        sid = uuid.UUID(str(raw.get("subject_id") or raw.get("subjectId")))
        role = str(raw.get("subject_role") or raw.get("subjectRole") or "").strip()
        if role not in VALID_ROLES:
            raise HTTPException(
                422,
                detail={
                    "error": f"Invalid subject role: {role}",
                    "code": "VALIDATION_ERROR",
                },
            )
        desired[sid] = role

    existing = await conn.fetch(
        "SELECT * FROM curriculum_subjects WHERE curriculum_id=$1",
        curriculum_id,
    )

    next_state: dict[uuid.UUID, dict[str, set[str]]] = {}
    for row in existing:
        sid = row["subject_id"]
        role = row["subject_role"]
        kept = {lv for lv in (row["applies_to_levels"] or []) if lv not in band_set}
        if kept:
            next_state.setdefault(sid, {})[role] = (
                next_state.get(sid, {}).get(role, set()) | kept
            )

    for sid, role in desired.items():
        next_state.setdefault(sid, {}).setdefault(role, set()).update(band_set)

    existing_subject_ids = {row["subject_id"] for row in existing}
    next_subject_ids = {
        sid for sid, roles in next_state.items() if any(roles.values())
    }
    removed_subjects = existing_subject_ids - next_subject_ids
    if removed_subjects:
        blocked = await conn.fetchval(
            """
            SELECT 1
            FROM student_subject_registrations r
            JOIN student_curriculum_enrollments e ON e.id = r.enrollment_id
            WHERE e.curriculum_id = $1
              AND r.subject_id = ANY($2::uuid[])
              AND r.status = 'active'
            LIMIT 1
            """,
            curriculum_id,
            list(removed_subjects),
        )
        if blocked:
            raise HTTPException(
                409,
                detail={
                    "error": "Cannot remove subjects that students have already registered.",
                    "code": "SUBJECT_REGISTERED",
                },
            )

    existing_by_key = {
        (row["subject_id"], row["subject_role"]): row for row in existing
    }
    desired_keys = {
        (sid, role)
        for sid, roles in next_state.items()
        for role, lvl in roles.items()
        if lvl
    }

    for key, row in existing_by_key.items():
        if key not in desired_keys:
            await conn.execute(
                "DELETE FROM curriculum_subjects WHERE id=$1",
                row["id"],
            )

    order = 0
    for sid, roles in next_state.items():
        for role, lvl in roles.items():
            if not lvl:
                continue
            order += 1
            ordered = _ordered_levels(lvl)
            existing_row = existing_by_key.get((sid, role))
            if existing_row and (sid, role) in desired_keys:
                # Row may have been deleted above if key changed; only update if still desired
                still = await conn.fetchval(
                    "SELECT 1 FROM curriculum_subjects WHERE id=$1",
                    existing_row["id"],
                )
                if still:
                    await conn.execute(
                        """
                        UPDATE curriculum_subjects
                        SET applies_to_levels = $2, display_order = $3, is_active = true
                        WHERE id = $1
                        """,
                        existing_row["id"],
                        ordered,
                        order,
                    )
                    continue
            await conn.execute(
                """
                INSERT INTO curriculum_subjects(
                  curriculum_id, subject_id, subject_role, applies_to_levels, display_order
                ) VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (curriculum_id, subject_id, subject_role) DO UPDATE SET
                  applies_to_levels = EXCLUDED.applies_to_levels,
                  display_order = EXCLUDED.display_order,
                  is_active = true
                """,
                curriculum_id,
                sid,
                role,
                ordered,
                order,
            )

    return await list_curriculum_subjects(conn, school_id, curriculum_id)
