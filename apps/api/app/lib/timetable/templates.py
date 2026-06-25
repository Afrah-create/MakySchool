from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import time
from typing import Any

import asyncpg

from app.lib.timetable.errors import TimetableValidationError, times_overlap


@dataclass
class PeriodTemplate:
    period_number: int
    start_time: time
    end_time: time
    label: str | None = None


def _parse_time(value: str) -> time:
    parts = value.strip().split(":")
    if len(parts) < 2:
        raise ValueError("invalid time")
    hour = int(parts[0])
    minute = int(parts[1])
    second = int(parts[2]) if len(parts) > 2 else 0
    return time(hour, minute, second)


def serialize_template(row: asyncpg.Record) -> dict[str, Any]:
    return {
        "periodNumber": int(row["period_number"]),
        "label": row["label"],
        "startTime": row["start_time"].strftime("%H:%M"),
        "endTime": row["end_time"].strftime("%H:%M"),
    }


async def fetch_period_templates(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT period_number, label, start_time, end_time
        FROM school_period_templates
        WHERE school_id = $1
        ORDER BY period_number ASC
        """,
        school_id,
    )


async def fetch_template_map(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
) -> dict[int, PeriodTemplate]:
    rows = await fetch_period_templates(conn, school_id)
    return {
        int(row["period_number"]): PeriodTemplate(
            period_number=int(row["period_number"]),
            label=row["label"],
            start_time=row["start_time"],
            end_time=row["end_time"],
        )
        for row in rows
    }


def validate_template_shapes(templates: list[PeriodTemplate]) -> None:
    if not templates:
        raise TimetableValidationError(
            "Define at least one school teaching period before saving timetables.",
            "NO_PERIOD_TEMPLATES",
        )

    numbers: set[int] = set()
    for index, item in enumerate(templates):
        prefix = f"periods[{index}]"
        if item.period_number < 1:
            raise TimetableValidationError(
                "Period number must be at least 1.",
                "INVALID_PERIOD",
                {f"{prefix}.periodNumber": "Invalid period number."},
            )
        if item.period_number in numbers:
            raise TimetableValidationError(
                "Each period number can only appear once.",
                "DUPLICATE_PERIOD_NUMBER",
                {f"{prefix}.periodNumber": "Duplicate period number."},
            )
        numbers.add(item.period_number)
        if item.end_time <= item.start_time:
            raise TimetableValidationError(
                "End time must be after start time.",
                "INVALID_TIME_RANGE",
                {f"{prefix}.endTime": "End time must be after start time."},
            )

    ordered = sorted(templates, key=lambda item: item.period_number)
    for i, current in enumerate(ordered):
        for other in ordered[i + 1 :]:
            if times_overlap(
                current.start_time,
                current.end_time,
                other.start_time,
                other.end_time,
            ):
                raise TimetableValidationError(
                    "School period times must not overlap.",
                    "TEMPLATE_OVERLAP",
                    {
                        f"periods[{current.period_number - 1}].startTime": "Overlaps another period.",
                        f"periods[{other.period_number - 1}].startTime": "Overlaps another period.",
                    },
                )


async def replace_period_templates(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    templates: list[PeriodTemplate],
) -> list[asyncpg.Record]:
    validate_template_shapes(templates)
    await conn.execute(
        "DELETE FROM school_period_templates WHERE school_id = $1",
        school_id,
    )
    for item in templates:
        await conn.execute(
            """
            INSERT INTO school_period_templates
              (school_id, period_number, label, start_time, end_time, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            """,
            school_id,
            item.period_number,
            item.label,
            item.start_time,
            item.end_time,
        )
    return await fetch_period_templates(conn, school_id)


def apply_template_times(
    templates: dict[int, PeriodTemplate],
    period_number: int,
) -> tuple[time, time]:
    template = templates.get(period_number)
    if not template:
        raise TimetableValidationError(
            f"Period {period_number} is not defined in the school schedule.",
            "UNKNOWN_PERIOD",
            {"periodNumber": str(period_number)},
        )
    return template.start_time, template.end_time
