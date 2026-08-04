"""Safe academic-year create/update — never deletes historical terms."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date
from typing import Any, Sequence

import asyncpg


@dataclass(frozen=True)
class TermInputData:
    name: str
    start_date: date | None
    end_date: date | None


class AcademicYearError(Exception):
    def __init__(self, message: str, *, code: str = "VALIDATION_ERROR") -> None:
        super().__init__(message)
        self.message = message
        self.code = code


async def get_current_academic_year_id(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
) -> uuid.UUID | None:
    row = await conn.fetchrow(
        """
        SELECT id
        FROM academic_years
        WHERE school_id = $1 AND is_current = true
        ORDER BY created_at DESC
        LIMIT 1
        """,
        school_id,
    )
    return row["id"] if row else None


async def get_academic_year_by_id(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    academic_year_id: uuid.UUID,
) -> asyncpg.Record | None:
    return await conn.fetchrow(
        """
        SELECT id, school_id, year, is_current, status, created_at
        FROM academic_years
        WHERE id = $1 AND school_id = $2
        """,
        academic_year_id,
        school_id,
    )


async def require_current_academic_year_id(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
) -> uuid.UUID:
    year_id = await get_current_academic_year_id(conn, school_id)
    if year_id is None:
        raise AcademicYearError(
            "No current academic year is configured for this school.",
            code="ACADEMIC_YEAR_REQUIRED",
        )
    return year_id


def serialize_academic_year_row(
    row: asyncpg.Record,
    *,
    terms: list[dict[str, Any]] | None = None,
    term_count: int | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": str(row["id"]),
        "year": int(row["year"]),
        "isCurrent": bool(row["is_current"]),
        "status": row["status"] if "status" in row.keys() else None,
        "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
    }
    if term_count is not None:
        payload["termCount"] = term_count
    if terms is not None:
        payload["terms"] = terms
    return payload


async def list_academic_years(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    include_terms: bool = False,
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT
          ay.id,
          ay.year,
          ay.is_current,
          ay.status,
          ay.created_at,
          (
            SELECT COUNT(*)::int
            FROM terms t
            WHERE t.academic_year_id = ay.id AND t.school_id = ay.school_id
          ) AS term_count
        FROM academic_years ay
        WHERE ay.school_id = $1
        ORDER BY ay.year DESC, ay.created_at DESC
        """,
        school_id,
    )
    if not include_terms:
        return [
            serialize_academic_year_row(r, term_count=int(r["term_count"] or 0))
            for r in rows
        ]

    from app.lib.terms import term_is_current_by_dates

    out: list[dict[str, Any]] = []
    for row in rows:
        term_rows = await conn.fetch(
            """
            SELECT id, name, start_date, end_date, is_current
            FROM terms
            WHERE school_id = $1 AND academic_year_id = $2
            ORDER BY start_date NULLS LAST, name
            """,
            school_id,
            row["id"],
        )
        terms = [
            {
                "id": str(t["id"]),
                "name": t["name"],
                "startDate": t["start_date"].isoformat() if t["start_date"] else None,
                "endDate": t["end_date"].isoformat() if t["end_date"] else None,
                "isCurrent": term_is_current_by_dates(t["start_date"], t["end_date"])
                or bool(t["is_current"]),
            }
            for t in term_rows
        ]
        out.append(
            serialize_academic_year_row(
                row,
                terms=terms,
                term_count=len(terms),
            )
        )
    return out


async def set_current_academic_year(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    academic_year_id: uuid.UUID,
) -> dict[str, Any]:
    """
    Switch the school's current academic year.

    Non-destructive: other years stay intact and become closed/non-current.
    """
    target = await get_academic_year_by_id(conn, school_id, academic_year_id)
    if not target:
        raise AcademicYearError("Academic year not found.", code="NOT_FOUND")

    if target["is_current"]:
        return serialize_academic_year_row(target)

    await _set_current_year(conn, school_id, academic_year_id)

    from app.lib.terms import sync_term_current_flags

    await sync_term_current_flags(conn, school_id)

    refreshed = await get_academic_year_by_id(conn, school_id, academic_year_id)
    assert refreshed is not None
    return serialize_academic_year_row(refreshed)


def _normalize_terms(terms: Sequence[Any]) -> list[TermInputData]:
    normalized: list[TermInputData] = []
    for term in terms:
        if isinstance(term, TermInputData):
            name = term.name.strip()
            start = term.start_date
            end = term.end_date
        else:
            name = (getattr(term, "name", None) or "").strip()
            start = getattr(term, "startDate", None) or getattr(term, "start_date", None)
            end = getattr(term, "endDate", None) or getattr(term, "end_date", None)
        if not name:
            raise AcademicYearError("Each term must have a name.")
        normalized.append(TermInputData(name=name, start_date=start, end_date=end))
    if not normalized:
        raise AcademicYearError("At least one term is required.")
    return normalized


async def _set_current_year(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    academic_year_id: uuid.UUID,
) -> None:
    await conn.execute(
        """
        UPDATE academic_years
        SET is_current = false,
            status = CASE WHEN status = 'draft' THEN 'closed' ELSE 'closed' END
        WHERE school_id = $1
          AND id <> $2
          AND is_current = true
        """,
        school_id,
        academic_year_id,
    )
    await conn.execute(
        """
        UPDATE academic_years
        SET is_current = true,
            status = 'active'
        WHERE id = $1 AND school_id = $2
        """,
        academic_year_id,
        school_id,
    )


async def _upsert_terms_for_year(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    academic_year_id: uuid.UUID,
    terms: list[TermInputData],
) -> None:
    """Create or update terms for one year only. Never deletes terms."""
    for term in terms:
        existing = await conn.fetchrow(
            """
            SELECT id
            FROM terms
            WHERE school_id = $1
              AND academic_year_id = $2
              AND name = $3
            LIMIT 1
            """,
            school_id,
            academic_year_id,
            term.name,
        )
        if existing:
            await conn.execute(
                """
                UPDATE terms
                SET start_date = $2,
                    end_date = $3
                WHERE id = $1
                """,
                existing["id"],
                term.start_date,
                term.end_date,
            )
        else:
            await conn.execute(
                """
                INSERT INTO terms (
                  id, school_id, academic_year_id, name, start_date, end_date, is_current
                ) VALUES (
                  gen_random_uuid(), $1, $2, $3, $4, $5, false
                )
                """,
                school_id,
                academic_year_id,
                term.name,
                term.start_date,
                term.end_date,
            )


async def upsert_academic_year(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    year: int,
    terms: Sequence[Any],
    make_current: bool = True,
) -> uuid.UUID:
    """
    Idempotent academic-year upsert.

    - If (school_id, year) exists: update that year's terms in place.
    - If new: insert a new academic_years row and its terms.
    - Never deletes terms from this or any other year.
    """
    if not year or year < 1990 or year > 2100:
        raise AcademicYearError("A valid academic year is required.")

    normalized = _normalize_terms(terms)

    existing = await conn.fetchrow(
        """
        SELECT id, is_current, status
        FROM academic_years
        WHERE school_id = $1 AND year = $2
        LIMIT 1
        """,
        school_id,
        year,
    )

    if existing:
        academic_year_id = existing["id"]
        await _upsert_terms_for_year(conn, school_id, academic_year_id, normalized)
        if make_current:
            await _set_current_year(conn, school_id, academic_year_id)
    else:
        academic_year_id = uuid.uuid4()
        if make_current:
            await conn.execute(
                """
                UPDATE academic_years
                SET is_current = false, status = 'closed'
                WHERE school_id = $1 AND is_current = true
                """,
                school_id,
            )
        await conn.execute(
            """
            INSERT INTO academic_years (id, school_id, year, is_current, status)
            VALUES ($1, $2, $3, $4, $5)
            """,
            academic_year_id,
            school_id,
            year,
            make_current,
            "active" if make_current else "draft",
        )
        await _upsert_terms_for_year(conn, school_id, academic_year_id, normalized)

    from app.lib.terms import sync_term_current_flags

    await sync_term_current_flags(conn, school_id)
    return academic_year_id
