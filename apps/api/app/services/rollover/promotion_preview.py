"""Build structural promotion previews for a rollover track."""

from __future__ import annotations

import uuid
from typing import Any

import asyncpg

from app.lib.promotion_rules import (
    RolloverTrack,
    default_promotion_decision,
    levels_for_track,
    map_class_label,
)


class PromotionPreviewError(Exception):
    def __init__(self, message: str, *, code: str = "VALIDATION_ERROR") -> None:
        super().__init__(message)
        self.message = message
        self.code = code


async def build_promotion_preview(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    track: RolloverTrack,
    from_academic_year_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    if track not in ("primary", "secondary"):
        raise PromotionPreviewError("Track must be 'primary' or 'secondary'.")

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
        raise PromotionPreviewError(
            "Academic year not found for this school.",
            code="ACADEMIC_YEAR_REQUIRED",
        )

    levels = list(levels_for_track(track))
    class_rows = await conn.fetch(
        """
        SELECT id, level, stream
        FROM school_classes
        WHERE school_id = $1 AND level = ANY($2::text[])
        """,
        school_id,
        levels,
    )
    classes_by_key: dict[tuple[str, str], asyncpg.Record] = {}
    classes_by_id: dict[uuid.UUID, asyncpg.Record] = {}
    for row in class_rows:
        stream_key = row["stream"] or ""
        classes_by_key[(row["level"], stream_key)] = row
        classes_by_id[row["id"]] = row

    students = await conn.fetch(
        """
        SELECT
          s.id,
          s.learner_id,
          s.full_name,
          s.current_class_id,
          sc.level,
          sc.stream
        FROM students s
        JOIN school_classes sc ON sc.id = s.current_class_id
        WHERE s.school_id = $1
          AND s.status = 'active'
          AND sc.level = ANY($2::text[])
        ORDER BY sc.level, sc.stream, s.full_name
        """,
        school_id,
        levels,
    )

    rows: list[dict[str, Any]] = []
    promote = graduate = no_path = missing_target = 0

    for student in students:
        level = student["level"]
        stream = student["stream"]
        decision = default_promotion_decision(level, track=track)
        current_label = map_class_label(level, stream)

        proposed_class_id: str | None = None
        proposed_class_label: str | None = None
        action = decision.action
        reason = decision.reason

        if decision.action == "promote" and decision.next_level:
            target = classes_by_key.get((decision.next_level, stream or ""))
            if target is None and stream:
                # Fall back to any stream at next level only when exact stream missing
                target = next(
                    (
                        c
                        for c in class_rows
                        if c["level"] == decision.next_level and not c["stream"]
                    ),
                    None,
                )
            if target is None:
                action = "no_path"
                reason = (
                    f"No class found for {decision.next_level}"
                    f"{stream or ''} — create the class before promoting."
                )
                missing_target += 1
                no_path += 1
            else:
                proposed_class_id = str(target["id"])
                proposed_class_label = map_class_label(target["level"], target["stream"])
                promote += 1
        elif decision.action == "graduate":
            graduate += 1
        else:
            no_path += 1

        rows.append(
            {
                "studentId": str(student["id"]),
                "learnerId": student["learner_id"],
                "fullName": student["full_name"],
                "currentClassId": str(student["current_class_id"]),
                "currentClassLabel": current_label,
                "currentLevel": level,
                "currentStream": stream,
                "proposedAction": action,
                "proposedClassId": proposed_class_id,
                "proposedClassLabel": proposed_class_label,
                "reason": reason,
                "requiresManualEnrollment": decision.requires_manual_enrollment,
                "overrideAction": None,
            }
        )

    return {
        "summary": {
            "track": track,
            "fromAcademicYearId": str(year_row["id"]),
            "fromYear": int(year_row["year"]),
            "total": len(rows),
            "promote": promote,
            "graduate": graduate,
            "noPath": no_path,
            "missingTargetClass": missing_target,
        },
        "students": rows,
    }
