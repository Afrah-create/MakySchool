"""School data retention settings — UI visibility only, never deletes data."""

from __future__ import annotations

import uuid
from typing import Any, Literal

import asyncpg

from app.lib.academic_years import list_academic_years

YearVisibility = Literal["hot", "warm", "archive"]


class RetentionSettingsError(Exception):
    def __init__(self, message: str, *, code: str = "VALIDATION_ERROR") -> None:
        super().__init__(message)
        self.message = message
        self.code = code


DEFAULTS = {
    "hotYears": 3,
    "warmYears": 3,
    "archiveAfterYears": 6,
}


async def get_or_create_retention_settings(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
) -> dict[str, Any]:
    row = await conn.fetchrow(
        """
        SELECT school_id, hot_years, warm_years, archive_after_years, updated_at
        FROM school_data_retention_settings
        WHERE school_id = $1
        """,
        school_id,
    )
    if not row:
        row = await conn.fetchrow(
            """
            INSERT INTO school_data_retention_settings (
              school_id, hot_years, warm_years, archive_after_years
            ) VALUES ($1, 3, 3, 6)
            ON CONFLICT (school_id) DO UPDATE
              SET school_id = EXCLUDED.school_id
            RETURNING school_id, hot_years, warm_years, archive_after_years, updated_at
            """,
            school_id,
        )
    assert row is not None
    return {
        "hotYears": int(row["hot_years"]),
        "warmYears": int(row["warm_years"]),
        "archiveAfterYears": int(row["archive_after_years"]),
        "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
    }


async def update_retention_settings(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    hot_years: int | None,
    warm_years: int | None,
    archive_after_years: int | None,
    actor_id: uuid.UUID | None,
) -> dict[str, Any]:
    current = await get_or_create_retention_settings(conn, school_id)
    hot = hot_years if hot_years is not None else current["hotYears"]
    warm = warm_years if warm_years is not None else current["warmYears"]
    archive = (
        archive_after_years
        if archive_after_years is not None
        else current["archiveAfterYears"]
    )

    if hot < 1 or hot > 20:
        raise RetentionSettingsError("hotYears must be between 1 and 20.")
    if warm < 0 or warm > 20:
        raise RetentionSettingsError("warmYears must be between 0 and 20.")
    if archive < 1 or archive > 50:
        raise RetentionSettingsError("archiveAfterYears must be between 1 and 50.")
    if archive < hot + warm:
        raise RetentionSettingsError(
            "archiveAfterYears must be >= hotYears + warmYears.",
            code="VALIDATION_ERROR",
        )

    row = await conn.fetchrow(
        """
        INSERT INTO school_data_retention_settings (
          school_id, hot_years, warm_years, archive_after_years, updated_by, updated_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (school_id) DO UPDATE SET
          hot_years = EXCLUDED.hot_years,
          warm_years = EXCLUDED.warm_years,
          archive_after_years = EXCLUDED.archive_after_years,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
        RETURNING school_id, hot_years, warm_years, archive_after_years, updated_at
        """,
        school_id,
        hot,
        warm,
        archive,
        actor_id,
    )
    assert row is not None
    return {
        "hotYears": int(row["hot_years"]),
        "warmYears": int(row["warm_years"]),
        "archiveAfterYears": int(row["archive_after_years"]),
        "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
    }


def classify_year(
    *,
    year: int,
    current_year: int,
    hot_years: int,
    warm_years: int,
    archive_after_years: int,
) -> YearVisibility:
    age = current_year - year
    if age < 0:
        return "hot"
    if age < hot_years:
        return "hot"
    if age < hot_years + warm_years:
        return "warm"
    if age < archive_after_years:
        return "warm"
    return "archive"


async def list_years_with_visibility(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    visibility: Literal["hot", "warm", "archive", "historical", "all"] = "all",
    include_terms: bool = False,
) -> dict[str, Any]:
    settings = await get_or_create_retention_settings(conn, school_id)
    years = await list_academic_years(conn, school_id, include_terms=include_terms)
    current = next((y for y in years if y["isCurrent"]), None)
    current_year_num = int(current["year"]) if current else (years[0]["year"] if years else 0)

    classified: list[dict[str, Any]] = []
    for y in years:
        bucket = classify_year(
            year=int(y["year"]),
            current_year=current_year_num,
            hot_years=settings["hotYears"],
            warm_years=settings["warmYears"],
            archive_after_years=settings["archiveAfterYears"],
        )
        item = {**y, "visibility": bucket}
        if visibility == "all":
            classified.append(item)
        elif visibility == "historical" and bucket in ("warm", "archive"):
            classified.append(item)
        elif bucket == visibility:
            classified.append(item)

    return {
        "settings": settings,
        "currentYear": current_year_num or None,
        "years": classified,
    }
