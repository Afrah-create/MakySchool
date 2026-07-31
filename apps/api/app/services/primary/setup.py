"""Primary setup — grading system, scale, subjects, themes."""

from __future__ import annotations

import uuid
from typing import Any

import asyncpg

from app.lib.primary_reports import (
    DEFAULT_GRADE_SCALE,
    DEFAULT_SUBJECTS,
    DEFAULT_THEMES,
    validate_grade_scale,
)


def serialize_setup(system: asyncpg.Record, scales: list[asyncpg.Record]) -> dict[str, Any]:
    return {
        "id": str(system["id"]),
        "name": system["name"],
        "caWeight": float(system["ca_weight"]),
        "examWeight": float(system["exam_weight"]),
        "allowThematicInP4": bool(system["allow_thematic_in_p4"]),
        "isActive": bool(system["is_active"]),
        "gradeScale": [
            {
                "id": str(s["id"]),
                "grade": s["grade"],
                "label": s["label"],
                "minPercent": float(s["min_percent"]),
                "maxPercent": float(s["max_percent"]),
                "remarks": s["remarks"],
                "displayOrder": s["display_order"],
            }
            for s in scales
        ],
    }


async def get_setup(conn: asyncpg.Connection, school_id: uuid.UUID) -> dict[str, Any] | None:
    system = await conn.fetchrow(
        """
        SELECT * FROM primary_grading_systems
        WHERE school_id = $1 AND is_active = true
        LIMIT 1
        """,
        school_id,
    )
    if not system:
        return None
    scales = await conn.fetch(
        """
        SELECT * FROM primary_grade_scales
        WHERE school_id = $1 AND grade_system_id = $2
        ORDER BY display_order, min_percent DESC
        """,
        school_id,
        system["id"],
    )
    return serialize_setup(system, scales)


async def ensure_setup(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    ca_weight: float = 30.0,
    exam_weight: float = 70.0,
    allow_thematic_in_p4: bool = False,
) -> dict[str, Any]:
    if abs(ca_weight + exam_weight - 100.0) > 0.01:
        raise ValueError("CA weight and exam weight must sum to 100.")

    existing = await get_setup(conn, school_id)
    if existing:
        return existing

    system = await conn.fetchrow(
        """
        INSERT INTO primary_grading_systems (
          school_id, ca_weight, exam_weight, allow_thematic_in_p4
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (school_id) DO UPDATE
          SET ca_weight = EXCLUDED.ca_weight,
              exam_weight = EXCLUDED.exam_weight,
              allow_thematic_in_p4 = EXCLUDED.allow_thematic_in_p4,
              updated_at = NOW()
        RETURNING *
        """,
        school_id,
        ca_weight,
        exam_weight,
        allow_thematic_in_p4,
    )

    scale_count = await conn.fetchval(
        "SELECT COUNT(*) FROM primary_grade_scales WHERE school_id = $1",
        school_id,
    )
    if not scale_count:
        await conn.executemany(
            """
            INSERT INTO primary_grade_scales (
              school_id, grade_system_id, grade, label,
              min_percent, max_percent, remarks, display_order
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (school_id, grade) DO NOTHING
            """,
            [
                (
                    school_id,
                    system["id"],
                    row["grade"],
                    row["label"],
                    row["min_percent"],
                    row["max_percent"],
                    row["remarks"],
                    row["display_order"],
                )
                for row in DEFAULT_GRADE_SCALE
            ],
        )

    subject_count = await conn.fetchval(
        "SELECT COUNT(*) FROM primary_subjects WHERE school_id = $1",
        school_id,
    )
    if not subject_count:
        await conn.executemany(
            """
            INSERT INTO primary_subjects (
              school_id, name, code, subject_type, applies_from, applies_to,
              max_mark, is_ple_subject, display_order
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (school_id, code) DO NOTHING
            """,
            [
                (
                    school_id,
                    s["name"],
                    s["code"],
                    s["subject_type"],
                    s["applies_from"],
                    s["applies_to"],
                    s.get("max_mark", 100),
                    s.get("is_ple_subject", False),
                    s.get("display_order", 0),
                )
                for s in DEFAULT_SUBJECTS
            ],
        )

    theme_count = await conn.fetchval(
        "SELECT COUNT(*) FROM primary_themes WHERE school_id = $1",
        school_id,
    )
    if not theme_count:
        await conn.executemany(
            """
            INSERT INTO primary_themes (
              school_id, name, applies_from, applies_to, display_order
            )
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (school_id, name) DO NOTHING
            """,
            [
                (
                    school_id,
                    t["name"],
                    t["applies_from"],
                    t["applies_to"],
                    t["display_order"],
                )
                for t in DEFAULT_THEMES
            ],
        )

    result = await get_setup(conn, school_id)
    assert result is not None
    return result


async def update_setup(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    ca_weight: float | None = None,
    exam_weight: float | None = None,
    allow_thematic_in_p4: bool | None = None,
    grade_scale: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    system = await conn.fetchrow(
        "SELECT * FROM primary_grading_systems WHERE school_id = $1",
        school_id,
    )
    if not system:
        raise LookupError("Primary module is not set up yet.")

    new_ca = float(system["ca_weight"]) if ca_weight is None else ca_weight
    new_exam = float(system["exam_weight"]) if exam_weight is None else exam_weight
    if abs(new_ca + new_exam - 100.0) > 0.01:
        raise ValueError("CA weight and exam weight must sum to 100.")

    thematic = (
        bool(system["allow_thematic_in_p4"])
        if allow_thematic_in_p4 is None
        else allow_thematic_in_p4
    )

    await conn.execute(
        """
        UPDATE primary_grading_systems
        SET ca_weight = $2,
            exam_weight = $3,
            allow_thematic_in_p4 = $4,
            updated_at = NOW()
        WHERE school_id = $1
        """,
        school_id,
        new_ca,
        new_exam,
        thematic,
    )

    if grade_scale is not None:
        err = validate_grade_scale(grade_scale)
        if err:
            raise ValueError(err)
        await conn.execute(
            "DELETE FROM primary_grade_scales WHERE school_id = $1",
            school_id,
        )
        await conn.executemany(
            """
            INSERT INTO primary_grade_scales (
              school_id, grade_system_id, grade, label,
              min_percent, max_percent, remarks, display_order
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            """,
            [
                (
                    school_id,
                    system["id"],
                    row["grade"],
                    row["label"],
                    row["minPercent"],
                    row["maxPercent"],
                    row.get("remarks"),
                    row.get("displayOrder", i + 1),
                )
                for i, row in enumerate(grade_scale)
            ],
        )

    result = await get_setup(conn, school_id)
    assert result is not None
    return result
