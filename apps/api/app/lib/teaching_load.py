"""Teaching load matrix: curriculum slots (class + subject) and assigned teachers."""

from __future__ import annotations

import uuid
from typing import Any

import asyncpg

from app.lib.teacher_assignments import (
    AssignmentInput,
    format_class_name,
    sync_teacher_assignments,
)
from app.lib.user_sql import USER_DISPLAY_NAME_SQL


async def fetch_teaching_load_matrix(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
) -> dict[str, Any]:
    slot_rows = await conn.fetch(
        f"""
        SELECT
          sc.id AS class_id,
          sc.level,
          sc.stream,
          s.id AS subject_id,
          s.name AS subject_name,
          tca.teacher_id,
          COALESCE(teacher.name, teacher.full_name) AS teacher_name
        FROM school_class_subjects cs
        JOIN school_classes sc ON sc.id = cs.class_id AND sc.school_id = cs.school_id
        JOIN school_subjects s ON s.id = cs.subject_id AND s.school_id = cs.school_id
        LEFT JOIN teacher_class_assignments tca
          ON tca.school_id = cs.school_id
         AND tca.class_id = cs.class_id
         AND tca.subject_id = cs.subject_id
        LEFT JOIN users teacher
          ON teacher.id = tca.teacher_id
         AND teacher.school_id = cs.school_id
         AND LOWER(teacher.role) = 'teacher'
        WHERE cs.school_id = $1
        ORDER BY sc.level, sc.stream NULLS LAST, s.name
        """,
        school_id,
    )

    teacher_rows = await conn.fetch(
        f"""
        SELECT
          u.id,
          {USER_DISPLAY_NAME_SQL} AS full_name,
          COALESCE(u.is_active, true) AS is_active,
          (
            SELECT COUNT(*)::int
            FROM teacher_class_assignments tca
            WHERE tca.school_id = u.school_id
              AND tca.teacher_id = u.id
              AND tca.subject_id IS NOT NULL
          ) AS slot_count
        FROM users u
        WHERE u.school_id = $1
          AND LOWER(u.role) = 'teacher'
        ORDER BY {USER_DISPLAY_NAME_SQL} ASC
        """,
        school_id,
    )

    slots: list[dict[str, Any]] = []
    assigned = 0
    for row in slot_rows:
        teacher_id = row["teacher_id"]
        if teacher_id:
            assigned += 1
        slots.append(
            {
                "class_id": str(row["class_id"]),
                "class_name": format_class_name(row["level"], row["stream"]),
                "stream": row["stream"],
                "subject_id": str(row["subject_id"]),
                "subject_name": row["subject_name"],
                "teacher_id": str(teacher_id) if teacher_id else None,
                "teacher_name": row["teacher_name"],
            }
        )

    teachers = [
        {
            "id": str(row["id"]),
            "full_name": row["full_name"],
            "is_active": bool(row["is_active"]),
            "slot_count": int(row["slot_count"] or 0),
        }
        for row in teacher_rows
    ]
    teachers_without_load = [t["id"] for t in teachers if t["is_active"] and t["slot_count"] == 0]

    return {
        "slots": slots,
        "teachers": teachers,
        "stats": {
            "total_slots": len(slots),
            "assigned": assigned,
            "unassigned": len(slots) - assigned,
            "teachers_without_load": len(teachers_without_load),
        },
        "teachers_without_load": teachers_without_load,
    }


def _slot_key(class_id: str, subject_id: str) -> str:
    return f"{class_id}:{subject_id}"


def _assignments_for_teacher(
    teacher_id: str,
    slot_map: dict[str, dict[str, Any]],
) -> list[AssignmentInput]:
    desired: list[AssignmentInput] = []
    for slot in slot_map.values():
        if slot.get("teacher_id") == teacher_id and slot.get("subject_id"):
            desired.append(
                AssignmentInput(
                    class_id=uuid.UUID(slot["class_id"]),
                    subject_id=uuid.UUID(slot["subject_id"]),
                )
            )
    return desired


async def _current_teacher_assignments(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
) -> list[AssignmentInput]:
    rows = await conn.fetch(
        """
        SELECT class_id, subject_id
        FROM teacher_class_assignments
        WHERE school_id = $1 AND teacher_id = $2 AND subject_id IS NOT NULL
        """,
        school_id,
        teacher_id,
    )
    return [
        AssignmentInput(class_id=row["class_id"], subject_id=row["subject_id"])
        for row in rows
    ]


def _assignment_sets_equal(
    a: list[AssignmentInput],
    b: list[AssignmentInput],
) -> bool:
    def key(item: AssignmentInput) -> str:
        return f"{item.class_id}:{item.subject_id}"

    return {key(x) for x in a} == {key(x) for x in b}


async def apply_slot_updates(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor_id: uuid.UUID,
    updates: list[dict[str, Any]],
    *,
    acknowledge_warnings: bool = False,
) -> dict[str, Any]:
    """Apply class+subject → teacher slot changes; syncs affected teachers."""
    if not updates:
        return {"ok": True, "preview": None}

    matrix = await fetch_teaching_load_matrix(conn, school_id)
    slot_map = {_slot_key(s["class_id"], s["subject_id"]): dict(s) for s in matrix["slots"]}

    for update in updates:
        class_id = str(update["class_id"])
        subject_id = str(update["subject_id"])
        key = _slot_key(class_id, subject_id)
        if key not in slot_map:
            return {
                "ok": False,
                "code": "INVALID_SLOT",
                "error": "One or more class and subject pairs are not in the class curriculum.",
                "fields": {"slots": f"Invalid slot: {key}"},
            }
        teacher_id = update.get("teacher_id")
        slot_map[key]["teacher_id"] = str(teacher_id) if teacher_id else None
        slot_map[key]["teacher_name"] = None

    affected_teacher_ids: set[str] = set()
    for update in updates:
        if update.get("teacher_id"):
            affected_teacher_ids.add(str(update["teacher_id"]))
        key = _slot_key(str(update["class_id"]), str(update["subject_id"]))
        previous = matrix["slots"]
        prev_slot = next(
            (s for s in previous if _slot_key(s["class_id"], s["subject_id"]) == key),
            None,
        )
        if prev_slot and prev_slot.get("teacher_id"):
            affected_teacher_ids.add(str(prev_slot["teacher_id"]))

    all_teacher_ids = {t["id"] for t in matrix["teachers"]}
    for tid in affected_teacher_ids:
        if tid not in all_teacher_ids:
            return {
                "ok": False,
                "code": "VALIDATION_ERROR",
                "error": "One or more selected teachers are invalid.",
                "fields": {"teacher_id": "Teacher not found in your school."},
            }

    combined_preview: dict[str, Any] = {
        "warnings": [],
        "blocks": [],
        "to_add": [],
        "to_remove": [],
    }

    for teacher_id_str in affected_teacher_ids:
            teacher_id = uuid.UUID(teacher_id_str)
            desired = _assignments_for_teacher(teacher_id_str, slot_map)
            current = await _current_teacher_assignments(conn, school_id, teacher_id)
            if _assignment_sets_equal(current, desired):
                continue

            result = await sync_teacher_assignments(
                conn,
                school_id,
                teacher_id,
                actor_id,
                desired,
                acknowledge_warnings=acknowledge_warnings,
            )
            if not result["ok"]:
                return result

            preview = result.get("preview") or {}
            combined_preview["warnings"].extend(preview.get("warnings") or [])
            combined_preview["blocks"].extend(preview.get("blocks") or [])
            combined_preview["to_add"].extend(preview.get("to_add") or [])
            combined_preview["to_remove"].extend(preview.get("to_remove") or [])

    return {"ok": True, "preview": combined_preview}


async def apply_teacher_load(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
    actor_id: uuid.UUID,
    assignments: list[AssignmentInput],
    *,
    acknowledge_warnings: bool = False,
) -> dict[str, Any]:
    """Replace one teacher's teaching load (subject required on every row)."""
    for index, item in enumerate(assignments):
        if not item.subject_id:
            return {
                "ok": False,
                "code": "VALIDATION_ERROR",
                "error": "Every teaching assignment must include a subject.",
                "fields": {
                    "assignments": f"Assignment {index + 1} is missing a subject.",
                },
            }
        linked = await conn.fetchval(
            """
            SELECT 1
            FROM school_class_subjects cs
            WHERE cs.school_id = $1
              AND cs.class_id = $2
              AND cs.subject_id = $3
            LIMIT 1
            """,
            school_id,
            item.class_id,
            item.subject_id,
        )
        if not linked:
            return {
                "ok": False,
                "code": "VALIDATION_ERROR",
                "error": "One or more assignments are not part of the class curriculum.",
                "fields": {
                    "assignments": (
                        f"Assignment {index + 1}: subject is not linked to the selected class."
                    ),
                },
            }

    return await sync_teacher_assignments(
        conn,
        school_id,
        teacher_id,
        actor_id,
        assignments,
        acknowledge_warnings=acknowledge_warnings,
    )
