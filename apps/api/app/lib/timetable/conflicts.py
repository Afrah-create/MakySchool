from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import time
from typing import Any

import asyncpg

from app.lib.teacher_assignments import format_class_name
from app.lib.timetable.errors import TimetableValidationError, times_overlap
from app.lib.timetable.templates import apply_template_times, fetch_template_map
from app.lib.user_sql import USER_DISPLAY_NAME_SQL

TRACK_VALUES = frozenset({"secular", "theology", "both"})


@dataclass
class PeriodInput:
    day_of_week: int
    period_number: int
    start_time: time
    end_time: time
    subject_id: uuid.UUID
    teacher_id: uuid.UUID
    track: str = "secular"


async def _teacher_display_name(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
) -> str:
    row = await conn.fetchrow(
        f"""
        SELECT {USER_DISPLAY_NAME_SQL} AS name
        FROM users u
        WHERE u.id = $1 AND u.school_id = $2
        LIMIT 1
        """,
        teacher_id,
        school_id,
    )
    return (row["name"] if row else None) or "Teacher"


async def _class_display_name(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    class_id: uuid.UUID,
) -> str:
    row = await conn.fetchrow(
        """
        SELECT level, stream
        FROM school_classes
        WHERE id = $1 AND school_id = $2
        LIMIT 1
        """,
        class_id,
        school_id,
    )
    if not row:
        return "another class"
    return format_class_name(row["level"], row["stream"])


async def validate_subject_linked_to_class(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    class_id: uuid.UUID,
    subject_id: uuid.UUID,
) -> None:
    row = await conn.fetchrow(
        """
        SELECT 1
        FROM school_class_subjects
        WHERE school_id = $1 AND class_id = $2 AND subject_id = $3
        LIMIT 1
        """,
        school_id,
        class_id,
        subject_id,
    )
    if not row:
        raise TimetableValidationError(
            "This subject is not linked to the selected class.",
            "SUBJECT_NOT_LINKED",
            {"subjectId": str(subject_id)},
        )


async def validate_teacher_assigned(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    class_id: uuid.UUID,
    subject_id: uuid.UUID,
    teacher_id: uuid.UUID,
) -> None:
    row = await conn.fetchrow(
        """
        SELECT 1
        FROM teacher_class_assignments
        WHERE school_id = $1
          AND teacher_id = $2
          AND class_id = $3
          AND subject_id = $4
        LIMIT 1
        """,
        school_id,
        teacher_id,
        class_id,
        subject_id,
    )
    if not row:
        teacher_name = await _teacher_display_name(conn, school_id, teacher_id)
        raise TimetableValidationError(
            f"{teacher_name} is not assigned to teach this subject in the selected class.",
            "TEACHER_NOT_ASSIGNED",
            {"teacherId": str(teacher_id), "subjectId": str(subject_id)},
        )


def _validate_period_shape(period: PeriodInput, index: int) -> None:
    prefix = f"periods[{index}]"
    if period.day_of_week < 1 or period.day_of_week > 7:
        raise TimetableValidationError(
            "Day of week must be between 1 (Monday) and 7 (Sunday).",
            "INVALID_DAY",
            {f"{prefix}.dayOfWeek": "Invalid day."},
        )
    if period.period_number < 1:
        raise TimetableValidationError(
            "Period number must be at least 1.",
            "INVALID_PERIOD",
            {f"{prefix}.periodNumber": "Invalid period."},
        )
    if period.end_time <= period.start_time:
        raise TimetableValidationError(
            "End time must be after start time.",
            "INVALID_TIME_RANGE",
            {f"{prefix}.endTime": "End time must be after start time."},
        )
    if period.track not in TRACK_VALUES:
        raise TimetableValidationError(
            "Track must be secular, theology, or both.",
            "INVALID_TRACK",
            {f"{prefix}.track": "Invalid track."},
        )


async def validate_bulk_replace(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    class_id: uuid.UUID,
    term_id: uuid.UUID | None,
    periods: list[PeriodInput],
) -> None:
    class_row = await conn.fetchrow(
        "SELECT 1 FROM school_classes WHERE id = $1 AND school_id = $2 LIMIT 1",
        class_id,
        school_id,
    )
    if not class_row:
        raise TimetableValidationError("Class not found.", "NOT_FOUND")

    if term_id is not None:
        term_row = await conn.fetchrow(
            "SELECT 1 FROM terms WHERE id = $1 AND school_id = $2 LIMIT 1",
            term_id,
            school_id,
        )
        if not term_row:
            raise TimetableValidationError("Term not found.", "NOT_FOUND")

    templates = await fetch_template_map(conn, school_id)
    if not templates:
        raise TimetableValidationError(
            "Define school teaching periods before saving timetables.",
            "NO_PERIOD_TEMPLATES",
        )

    slot_keys: set[tuple[int, int]] = set()
    for index, period in enumerate(periods):
        try:
            start_time, end_time = apply_template_times(templates, period.period_number)
            period.start_time = start_time
            period.end_time = end_time
        except TimetableValidationError as exc:
            raise TimetableValidationError(
                exc.message,
                exc.code,
                {f"periods[{index}].periodNumber": exc.message},
            ) from exc
        _validate_period_shape(period, index)
        key = (period.day_of_week, period.period_number)
        if key in slot_keys:
            raise TimetableValidationError(
                "This class already has another subject in that period slot.",
                "CLASS_SLOT_CONFLICT",
                {
                    f"periods[{index}].dayOfWeek": "Duplicate slot.",
                    f"periods[{index}].periodNumber": "Duplicate slot.",
                },
            )
        slot_keys.add(key)

        await validate_subject_linked_to_class(conn, school_id, class_id, period.subject_id)
        await validate_teacher_assigned(
            conn, school_id, class_id, period.subject_id, period.teacher_id
        )

    for i, a in enumerate(periods):
        for j in range(i + 1, len(periods)):
            b = periods[j]
            if a.teacher_id != b.teacher_id or a.day_of_week != b.day_of_week:
                continue
            if times_overlap(a.start_time, a.end_time, b.start_time, b.end_time):
                teacher_name = await _teacher_display_name(conn, school_id, a.teacher_id)
                raise TimetableValidationError(
                    f"{teacher_name} has overlapping periods in this timetable.",
                    "TEACHER_CONFLICT",
                    {
                        f"periods[{i}].startTime": "Overlaps with another period.",
                        f"periods[{j}].startTime": "Overlaps with another period.",
                    },
                )

    for index, period in enumerate(periods):
        conflict = await conn.fetchrow(
            """
            SELECT tp.class_id, c.level, c.stream
            FROM timetable_periods tp
            JOIN school_classes c ON c.id = tp.class_id
            WHERE tp.school_id = $1
              AND tp.teacher_id = $2
              AND tp.day_of_week = $3
              AND tp.class_id != $4
              AND ($5::uuid IS NULL OR tp.term_id IS NOT DISTINCT FROM $5::uuid)
              AND tp.start_time < $7
              AND tp.end_time > $6
            LIMIT 1
            """,
            school_id,
            period.teacher_id,
            period.day_of_week,
            class_id,
            term_id,
            period.start_time,
            period.end_time,
        )
        if conflict:
            teacher_name = await _teacher_display_name(conn, school_id, period.teacher_id)
            other_class = format_class_name(conflict["level"], conflict["stream"])
            raise TimetableValidationError(
                f"{teacher_name} is already teaching {other_class} at this time.",
                "TEACHER_CONFLICT",
                {
                    f"periods[{index}].dayOfWeek": "Teacher conflict.",
                    f"periods[{index}].startTime": "Teacher conflict.",
                },
            )


async def fetch_period_rows(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    class_id: uuid.UUID | None = None,
    teacher_id: uuid.UUID | None = None,
    term_id: uuid.UUID | None = None,
) -> list[asyncpg.Record]:
    conditions = ["tp.school_id = $1"]
    params: list[Any] = [school_id]
    param_idx = 2

    if class_id is not None:
        conditions.append(f"tp.class_id = ${param_idx}")
        params.append(class_id)
        param_idx += 1

    if teacher_id is not None:
        conditions.append(f"tp.teacher_id = ${param_idx}")
        params.append(teacher_id)
        param_idx += 1

    if term_id is not None:
        conditions.append(f"tp.term_id IS NOT DISTINCT FROM ${param_idx}")
        params.append(term_id)
        param_idx += 1

    where_clause = " AND ".join(conditions)
    return await conn.fetch(
        f"""
        SELECT
          tp.id,
          tp.class_id,
          tp.term_id,
          tp.day_of_week,
          tp.period_number,
          tp.start_time,
          tp.end_time,
          tp.subject_id,
          tp.teacher_id,
          tp.track,
          s.name AS subject_name,
          {USER_DISPLAY_NAME_SQL} AS teacher_name,
          c.level AS class_level,
          c.stream AS class_stream
        FROM timetable_periods tp
        JOIN school_subjects s ON s.id = tp.subject_id
        JOIN users u ON u.id = tp.teacher_id
        JOIN school_classes c ON c.id = tp.class_id
        WHERE {where_clause}
        ORDER BY tp.day_of_week ASC, tp.period_number ASC, tp.start_time ASC
        """,
        *params,
    )
