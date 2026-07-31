"""PLE results entry and analytics."""

from __future__ import annotations

import uuid
from typing import Any

import asyncpg

from app.lib.primary_reports import calculate_ple_division, ple_points


def serialize_ple(row: asyncpg.Record) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "studentId": str(row["student_id"]),
        "studentName": row.get("full_name"),
        "learnerId": row.get("learner_id"),
        "academicYearId": str(row["academic_year_id"]),
        "indexNumber": row["index_number"],
        "englishGrade": row["english_grade"],
        "englishPoints": row["english_points"],
        "mathGrade": row["math_grade"],
        "mathPoints": row["math_points"],
        "scienceGrade": row["science_grade"],
        "sciencePoints": row["science_points"],
        "sstGrade": row["sst_grade"],
        "sstPoints": row["sst_points"],
        "aggregate": row["aggregate"],
        "division": row["division"],
    }


async def list_ple(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    academic_year_id: uuid.UUID,
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT pr.*, s.full_name, s.learner_id
        FROM ple_results pr
        JOIN students s ON s.id = pr.student_id
        WHERE pr.school_id = $1 AND pr.academic_year_id = $2
        ORDER BY pr.aggregate NULLS LAST, s.full_name
        """,
        school_id,
        academic_year_id,
    )
    return [serialize_ple(r) for r in rows]


async def upsert_ple(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor_id: uuid.UUID,
    payload: dict[str, Any],
) -> dict[str, Any]:
    student_id = uuid.UUID(str(payload["student_id"]))
    academic_year_id = uuid.UUID(str(payload["academic_year_id"]))

    # Ensure student is in a P7 class (or allow historical entry)
    student = await conn.fetchrow(
        """
        SELECT s.id, s.full_name, s.learner_id, sc.level
        FROM students s
        LEFT JOIN school_classes sc ON sc.id = s.current_class_id
        WHERE s.id = $1 AND s.school_id = $2
        """,
        student_id,
        school_id,
    )
    if not student:
        raise LookupError("Student not found.")

    eng_p = ple_points(payload["english_grade"])
    math_p = ple_points(payload["math_grade"])
    sci_p = ple_points(payload["science_grade"])
    sst_p = ple_points(payload["sst_grade"])
    aggregate = eng_p + math_p + sci_p + sst_p
    division = calculate_ple_division(aggregate)

    row = await conn.fetchrow(
        """
        INSERT INTO ple_results (
          school_id, student_id, academic_year_id,
          english_grade, english_points, math_grade, math_points,
          science_grade, science_points, sst_grade, sst_points,
          aggregate, division, index_number, entered_by, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
        ON CONFLICT (student_id, academic_year_id) DO UPDATE SET
          english_grade = EXCLUDED.english_grade,
          english_points = EXCLUDED.english_points,
          math_grade = EXCLUDED.math_grade,
          math_points = EXCLUDED.math_points,
          science_grade = EXCLUDED.science_grade,
          science_points = EXCLUDED.science_points,
          sst_grade = EXCLUDED.sst_grade,
          sst_points = EXCLUDED.sst_points,
          aggregate = EXCLUDED.aggregate,
          division = EXCLUDED.division,
          index_number = EXCLUDED.index_number,
          entered_by = EXCLUDED.entered_by,
          updated_at = NOW()
        RETURNING *
        """,
        school_id,
        student_id,
        academic_year_id,
        payload["english_grade"].upper(),
        eng_p,
        payload["math_grade"].upper(),
        math_p,
        payload["science_grade"].upper(),
        sci_p,
        payload["sst_grade"].upper(),
        sst_p,
        aggregate,
        division,
        payload.get("index_number"),
        actor_id,
    )
    data = dict(row)
    data["full_name"] = student["full_name"]
    data["learner_id"] = student["learner_id"]
    return serialize_ple(data)  # type: ignore[arg-type]


async def bulk_upsert_ple(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor_id: uuid.UUID,
    rows: list[dict[str, Any]],
) -> dict[str, Any]:
    saved = 0
    errors: list[dict[str, str]] = []
    for index, payload in enumerate(rows):
        try:
            await upsert_ple(conn, school_id, actor_id, payload)
            saved += 1
        except Exception as exc:
            errors.append({"index": str(index), "error": str(exc)})
    return {"saved": saved, "errors": errors}


async def ple_analytics(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    academic_year_id: uuid.UUID,
) -> dict[str, Any]:
    rows = await conn.fetch(
        """
        SELECT division, COUNT(*)::int AS count
        FROM ple_results
        WHERE school_id = $1 AND academic_year_id = $2 AND division IS NOT NULL
        GROUP BY division
        """,
        school_id,
        academic_year_id,
    )
    by_div = {r["division"]: r["count"] for r in rows}
    total = sum(by_div.values())

    avg_points = await conn.fetchrow(
        """
        SELECT
          AVG(english_points) AS english,
          AVG(math_points) AS math,
          AVG(science_points) AS science,
          AVG(sst_points) AS sst
        FROM ple_results
        WHERE school_id = $1 AND academic_year_id = $2
        """,
        school_id,
        academic_year_id,
    )

    return {
        "total": total,
        "divisions": {
            "1": by_div.get("1", 0),
            "2": by_div.get("2", 0),
            "3": by_div.get("3", 0),
            "4": by_div.get("4", 0),
            "U": by_div.get("U", 0),
        },
        "subjectAveragePoints": {
            "english": float(avg_points["english"]) if avg_points["english"] else None,
            "math": float(avg_points["math"]) if avg_points["math"] else None,
            "science": float(avg_points["science"]) if avg_points["science"] else None,
            "sst": float(avg_points["sst"]) if avg_points["sst"] else None,
        },
    }
