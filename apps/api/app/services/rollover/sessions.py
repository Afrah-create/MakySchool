"""Rollover session lifecycle — interruptible drafts, one in-progress per track."""

from __future__ import annotations

import json
import uuid
from datetime import date, timedelta
from typing import Any

import asyncpg

from app.lib.promotion_rules import RolloverTrack


class RolloverSessionError(Exception):
    def __init__(self, message: str, *, code: str = "VALIDATION_ERROR") -> None:
        super().__init__(message)
        self.message = message
        self.code = code


def _serialize_session(row: asyncpg.Record) -> dict[str, Any]:
    draft = row["draft"]
    if isinstance(draft, str):
        draft = json.loads(draft)
    if not isinstance(draft, dict):
        draft = {}
    return {
        "id": str(row["id"]),
        "track": row["track"],
        "status": row["status"],
        "currentStep": int(row["current_step"]),
        "fromAcademicYearId": str(row["from_academic_year_id"]),
        "toAcademicYearId": str(row["to_academic_year_id"]) if row["to_academic_year_id"] else None,
        "draft": draft,
        "idempotencyKey": row["idempotency_key"],
        "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
        "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
        "completedAt": row["completed_at"].isoformat() if row["completed_at"] else None,
    }


def default_term_dates_from_previous(
    previous_terms: list[asyncpg.Record],
) -> list[dict[str, Any]]:
    """Shift prior term dates forward by 52 weeks (industry default)."""
    if not previous_terms:
        year = date.today().year
        return [
            {
                "name": "Term 1",
                "startDate": f"{year}-02-01",
                "endDate": f"{year}-04-30",
            },
            {
                "name": "Term 2",
                "startDate": f"{year}-05-15",
                "endDate": f"{year}-08-15",
            },
            {
                "name": "Term 3",
                "startDate": f"{year}-09-01",
                "endDate": f"{year}-12-05",
            },
        ]

    out: list[dict[str, Any]] = []
    for term in previous_terms:
        start = term["start_date"]
        end = term["end_date"]
        out.append(
            {
                "name": term["name"],
                "startDate": (start + timedelta(weeks=52)).isoformat() if start else None,
                "endDate": (end + timedelta(weeks=52)).isoformat() if end else None,
            }
        )
    return out


async def list_in_progress_sessions(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT *
        FROM academic_year_rollover_sessions
        WHERE school_id = $1 AND status = 'in_progress'
        ORDER BY track
        """,
        school_id,
    )
    return [_serialize_session(r) for r in rows]


async def get_session(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    session_id: uuid.UUID,
) -> dict[str, Any]:
    row = await conn.fetchrow(
        """
        SELECT *
        FROM academic_year_rollover_sessions
        WHERE id = $1 AND school_id = $2
        """,
        session_id,
        school_id,
    )
    if not row:
        raise RolloverSessionError("Rollover session not found.", code="NOT_FOUND")
    return _serialize_session(row)


async def start_session(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    track: RolloverTrack,
    actor_id: uuid.UUID,
    from_academic_year_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    if track not in ("primary", "secondary"):
        raise RolloverSessionError("Track must be 'primary' or 'secondary'.")

    existing = await conn.fetchrow(
        """
        SELECT id
        FROM academic_year_rollover_sessions
        WHERE school_id = $1 AND track = $2 AND status = 'in_progress'
        LIMIT 1
        """,
        school_id,
        track,
    )
    if existing:
        return await get_session(conn, school_id, existing["id"])

    if from_academic_year_id is None:
        year_row = await conn.fetchrow(
            """
            SELECT id, year
            FROM academic_years
            WHERE school_id = $1 AND is_current = true
            ORDER BY created_at DESC
            LIMIT 1
            """,
            school_id,
        )
    else:
        year_row = await conn.fetchrow(
            """
            SELECT id, year
            FROM academic_years
            WHERE school_id = $1 AND id = $2
            """,
            school_id,
            from_academic_year_id,
        )

    if not year_row:
        raise RolloverSessionError(
            "No academic year found to roll from.",
            code="ACADEMIC_YEAR_REQUIRED",
        )

    terms = await conn.fetch(
        """
        SELECT name, start_date, end_date
        FROM terms
        WHERE school_id = $1 AND academic_year_id = $2
        ORDER BY start_date NULLS LAST, name
        """,
        school_id,
        year_row["id"],
    )

    draft = {
        "newYear": {
            "year": int(year_row["year"]) + 1,
            "terms": default_term_dates_from_previous(list(terms)),
        },
        "studentDecisions": {},
        "teacherAssignmentIds": [],
        "feePercentIncrease": 0,
        "feeStructureIds": [],
        "timetable": {"include": True, "sourceTermId": None},
    }

    row = await conn.fetchrow(
        """
        INSERT INTO academic_year_rollover_sessions (
          school_id, track, from_academic_year_id, status, current_step,
          draft, created_by, created_at, updated_at
        ) VALUES (
          $1, $2, $3, 'in_progress', 1, $4::jsonb, $5, NOW(), NOW()
        )
        RETURNING *
        """,
        school_id,
        track,
        year_row["id"],
        json.dumps(draft),
        actor_id,
    )
    return _serialize_session(row)


async def patch_session(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    session_id: uuid.UUID,
    *,
    current_step: int | None = None,
    draft_patch: dict[str, Any] | None = None,
) -> dict[str, Any]:
    row = await conn.fetchrow(
        """
        SELECT *
        FROM academic_year_rollover_sessions
        WHERE id = $1 AND school_id = $2
        FOR UPDATE
        """,
        session_id,
        school_id,
    )
    if not row:
        raise RolloverSessionError("Rollover session not found.", code="NOT_FOUND")
    if row["status"] != "in_progress":
        raise RolloverSessionError(
            "Only in-progress rollover sessions can be updated.",
            code="SESSION_LOCKED",
        )

    draft = row["draft"]
    if isinstance(draft, str):
        draft = json.loads(draft)
    draft = dict(draft or {})
    if draft_patch:
        for key, value in draft_patch.items():
            if key == "studentDecisions" and isinstance(value, dict):
                existing = dict(draft.get("studentDecisions") or {})
                existing.update(value)
                draft["studentDecisions"] = existing
            else:
                draft[key] = value

    step = current_step if current_step is not None else int(row["current_step"])
    if step < 1 or step > 6:
        raise RolloverSessionError("Step must be between 1 and 6.")

    updated = await conn.fetchrow(
        """
        UPDATE academic_year_rollover_sessions
        SET draft = $3::jsonb,
            current_step = $4,
            updated_at = NOW()
        WHERE id = $1 AND school_id = $2
        RETURNING *
        """,
        session_id,
        school_id,
        json.dumps(draft),
        step,
    )
    return _serialize_session(updated)


async def cancel_session(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    session_id: uuid.UUID,
) -> dict[str, Any]:
    row = await conn.fetchrow(
        """
        UPDATE academic_year_rollover_sessions
        SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1 AND school_id = $2 AND status = 'in_progress'
        RETURNING *
        """,
        session_id,
        school_id,
    )
    if not row:
        raise RolloverSessionError(
            "In-progress rollover session not found.",
            code="NOT_FOUND",
        )
    return _serialize_session(row)
