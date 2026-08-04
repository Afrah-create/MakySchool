from __future__ import annotations

import uuid
from typing import Any

import asyncpg
from fastapi.encoders import jsonable_encoder

from app.lib.storage_urls import enrich_school_media
from app.services.students.learner_ids import validate_learner_id_settings


async def fetch_school_settings(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
) -> dict[str, Any]:
    school = await conn.fetchrow(
        """
        SELECT id, slug, name, logo_url, stamp_url, email, phone, emails, phones, address, school_type,
               status, learner_id_prefix, learner_id_suffix_length, learner_id_mode,
               setup_completed_at, created_at
        FROM schools WHERE id = $1 LIMIT 1
        """,
        school_id,
    )
    if not school:
        raise ValueError("School not found")

    from app.lib.terms import sync_term_current_flags, term_is_current_by_dates

    await sync_term_current_flags(conn, school_id)

    year_row = await conn.fetchrow(
        """
        SELECT id, year, is_current, status
        FROM academic_years
        WHERE school_id = $1 AND is_current = true
        ORDER BY created_at DESC
        LIMIT 1
        """,
        school_id,
    )

    terms: list[asyncpg.Record] = []
    if year_row:
        terms = await conn.fetch(
            """
            SELECT id, name, start_date, end_date, is_current
            FROM terms
            WHERE school_id = $1 AND academic_year_id = $2
            ORDER BY start_date NULLS LAST, name
            """,
            school_id,
            year_row["id"],
        )

    bands = await conn.fetch(
        """
        SELECT id, label, min_score, max_score, description
        FROM grading_scales
        WHERE school_id = $1
        ORDER BY min_score DESC
        """,
        school_id,
    )

    school_payload = jsonable_encoder(dict(school))
    if isinstance(school_payload, dict):
        school_payload = await enrich_school_media(school_payload, school_id)
        # Ensure arrays always present for the client.
        emails = list(school_payload.get("emails") or [])
        phones = list(school_payload.get("phones") or [])
        if not emails and school_payload.get("email"):
            emails = [school_payload["email"]]
        if not phones and school_payload.get("phone"):
            phones = [school_payload["phone"]]
        school_payload["emails"] = emails
        school_payload["phones"] = phones

    return {
        "profile": school_payload,
        "academic_year": {
            "id": str(year_row["id"]) if year_row else None,
            "year": year_row["year"] if year_row else None,
            "status": year_row["status"] if year_row else None,
            "terms": [
                {
                    "id": str(term["id"]),
                    "name": term["name"],
                    "startDate": term["start_date"].isoformat() if term["start_date"] else None,
                    "endDate": term["end_date"].isoformat() if term["end_date"] else None,
                    "isCurrent": term_is_current_by_dates(
                        term["start_date"], term["end_date"]
                    )
                    or bool(term["is_current"]),
                }
                for term in terms
            ],
        },
        "academic_years": await _list_years_summary(conn, school_id),
        "grading_scale": {
            "bands": [
                {
                    "id": str(band["id"]),
                    "label": band["label"],
                    "minScore": float(band["min_score"]),
                    "maxScore": float(band["max_score"]),
                    "description": band["description"],
                }
                for band in bands
            ],
        },
        "student_ids": {
            "prefix": school["learner_id_prefix"],
            "suffixLength": school["learner_id_suffix_length"],
            "mode": school["learner_id_mode"],
        },
    }


async def _list_years_summary(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
) -> list[dict[str, Any]]:
    from app.lib.academic_years import list_academic_years

    return await list_academic_years(conn, school_id, include_terms=False)


async def update_student_id_settings(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    prefix: str | None,
    suffix_length: int | None,
    mode: str | None,
) -> dict[str, Any]:
    fields = validate_learner_id_settings(
        prefix=prefix,
        suffix_length=suffix_length,
        mode=mode,
    )
    if fields:
        raise ValueError(fields)

    row = await conn.fetchrow(
        """
        UPDATE schools
        SET learner_id_prefix = COALESCE($1, learner_id_prefix),
            learner_id_suffix_length = COALESCE($2, learner_id_suffix_length),
            learner_id_mode = COALESCE($3, learner_id_mode)
        WHERE id = $4
        RETURNING learner_id_prefix, learner_id_suffix_length, learner_id_mode
        """,
        prefix.strip().upper() if prefix else None,
        suffix_length,
        mode,
        school_id,
    )
    if not row:
        raise ValueError("School not found")

    return {
        "prefix": row["learner_id_prefix"],
        "suffixLength": row["learner_id_suffix_length"],
        "mode": row["learner_id_mode"],
    }
