"""Current academic term resolution based on calendar dates."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

import asyncpg


async def sync_term_current_flags(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    today: date | None = None,
) -> None:
    """Mark exactly one term as current (date match, prefer current academic year)."""
    on = today or date.today()
    await conn.execute(
        """
        UPDATE terms
        SET is_current = false
        WHERE school_id = $1 AND is_current = true
        """,
        school_id,
    )
    await conn.execute(
        """
        UPDATE terms
        SET is_current = true
        WHERE id = (
          SELECT t.id
          FROM terms t
          LEFT JOIN academic_years ay ON ay.id = t.academic_year_id
          WHERE t.school_id = $1
            AND t.start_date IS NOT NULL
            AND t.end_date IS NOT NULL
            AND t.start_date <= $2::date
            AND t.end_date >= $2::date
          ORDER BY
            (ay.is_current IS TRUE) DESC,
            t.start_date DESC NULLS LAST,
            t.id DESC
          LIMIT 1
        )
        """,
        school_id,
        on,
    )


async def fetch_current_term(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    today: date | None = None,
) -> asyncpg.Record | None:
    """
    Resolve the active term for a school.

    Preference order:
    1. Term whose start/end dates include today (within current academic year if any)
    2. Any term whose dates include today
    3. Flagged is_current (legacy)
    4. Latest start_date
    """
    on = today or date.today()
    # Keep flags aligned so list UIs and older queries stay consistent.
    await sync_term_current_flags(conn, school_id, today=on)

    return await conn.fetchrow(
        """
        SELECT
          t.id,
          t.name,
          t.start_date,
          t.end_date,
          t.is_current,
          t.academic_year_id,
          ay.year AS academic_year
        FROM terms t
        LEFT JOIN academic_years ay ON ay.id = t.academic_year_id
        WHERE t.school_id = $1
        ORDER BY
          (t.start_date IS NOT NULL AND t.end_date IS NOT NULL
           AND t.start_date <= $2::date AND t.end_date >= $2::date) DESC,
          (ay.is_current IS TRUE) DESC,
          t.is_current DESC,
          t.start_date DESC NULLS LAST
        LIMIT 1
        """,
        school_id,
        on,
    )


async def get_current_term_id(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
) -> uuid.UUID | None:
    row = await fetch_current_term(conn, school_id)
    return row["id"] if row else None


def term_is_current_by_dates(
    start: date | None,
    end: date | None,
    *,
    today: date | None = None,
) -> bool:
    if start is None or end is None:
        return False
    on = today or date.today()
    return start <= on <= end


def serialize_term_row(row: asyncpg.Record) -> dict[str, Any]:
    start = row.get("start_date")
    end = row.get("end_date")
    by_dates = term_is_current_by_dates(start, end)
    academic_year = row.get("academic_year")
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "startDate": start.isoformat() if start else None,
        "endDate": end.isoformat() if end else None,
        "isCurrent": by_dates or bool(row.get("is_current")),
        "academicYearId": str(row["academic_year_id"]) if row.get("academic_year_id") else None,
        "academicYear": int(academic_year) if academic_year is not None else None,
    }
