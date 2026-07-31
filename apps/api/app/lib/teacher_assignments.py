import uuid
from dataclasses import dataclass, field
from typing import Any

import asyncpg


@dataclass
class AssignmentInput:
    class_id: uuid.UUID
    subject_id: uuid.UUID | None = None


@dataclass
class ExistingAssignment:
    id: uuid.UUID
    class_id: uuid.UUID
    subject_id: uuid.UUID | None


@dataclass
class RemovalBlock:
    class_id: uuid.UUID
    class_name: str
    status: str
    reason: str


@dataclass
class RemovalWarning:
    class_id: uuid.UUID
    class_name: str
    status: str
    message: str


@dataclass
class AssignmentSyncPreview:
    to_add: list[AssignmentInput] = field(default_factory=list)
    to_remove: list[ExistingAssignment] = field(default_factory=list)
    warnings: list[RemovalWarning] = field(default_factory=list)
    blocks: list[RemovalBlock] = field(default_factory=list)


def _assignment_key(class_id: uuid.UUID, subject_id: uuid.UUID | None) -> str:
    return f"{class_id}:{subject_id or ''}"


def format_class_name(level: str, stream: str | None) -> str:
    return f"{level}{stream}" if stream else level


async def get_current_term_id(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
) -> uuid.UUID | None:
    from app.lib.terms import get_current_term_id as resolve_current_term_id

    return await resolve_current_term_id(conn, school_id)


async def _fetch_existing_assignments(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
) -> list[ExistingAssignment]:
    rows = await conn.fetch(
        """
        SELECT id, class_id, subject_id
        FROM teacher_class_assignments
        WHERE school_id = $1 AND teacher_id = $2
        """,
        school_id,
        teacher_id,
    )
    return [
        ExistingAssignment(id=r["id"], class_id=r["class_id"], subject_id=r["subject_id"])
        for r in rows
    ]


async def _class_names_for_ids(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    class_ids: list[uuid.UUID],
) -> dict[uuid.UUID, str]:
    if not class_ids:
        return {}

    rows = await conn.fetch(
        """
        SELECT id, level, stream
        FROM school_classes
        WHERE school_id = $1 AND id = ANY($2::uuid[])
        """,
        school_id,
        class_ids,
    )
    return {r["id"]: format_class_name(r["level"], r["stream"]) for r in rows}


def _fully_vacated_class_ids(
    to_remove: list[ExistingAssignment],
    desired: list[AssignmentInput],
) -> set[uuid.UUID]:
    vacated: set[uuid.UUID] = set()
    touched = {row.class_id for row in to_remove}

    for class_id in touched:
        still_desired = any(item.class_id == class_id for item in desired)
        if not still_desired:
            vacated.add(class_id)
    return vacated


async def _inspect_class_detach_impact(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
    class_ids: set[uuid.UUID],
    term_id: uuid.UUID | None,
) -> tuple[list[RemovalBlock], list[RemovalWarning]]:
    if not class_ids:
        return [], []

    names = await _class_names_for_ids(conn, school_id, list(class_ids))
    rows = await conn.fetch(
        """
        SELECT class_id, status
        FROM teacher_term_submissions
        WHERE school_id = $1
          AND teacher_id = $2
          AND class_id = ANY($3::uuid[])
          AND ($4::uuid IS NULL OR term_id = $4)
        """,
        school_id,
        teacher_id,
        list(class_ids),
        term_id,
    )

    blocks: list[RemovalBlock] = []
    warnings: list[RemovalWarning] = []

    for class_id in class_ids:
        class_name = names.get(class_id, "Class")
        submission = next((r for r in rows if r["class_id"] == class_id), None)

        if not submission:
            continue

        status = submission["status"]
        if status == "submitted":
            blocks.append(
                RemovalBlock(
                    class_id=class_id,
                    class_name=class_name,
                    status=status,
                    reason=(
                        f"Marks for {class_name} have already been submitted for the current term. "
                        "Reassign or archive marks before removing this teacher from the class."
                    ),
                )
            )
            continue

        if status == "draft":
            warnings.append(
                RemovalWarning(
                    class_id=class_id,
                    class_name=class_name,
                    status=status,
                    message=(
                        f"{class_name} has draft marks in progress. Detaching will revoke the "
                        "teacher's access but draft work will remain on record."
                    ),
                )
            )
            continue

        warnings.append(
            RemovalWarning(
                class_id=class_id,
                class_name=class_name,
                status=status,
                message=(
                    f"{class_name} has a pending marks submission for the current term. "
                    "The teacher will lose access immediately."
                ),
            )
        )

    return blocks, warnings


def plan_assignment_sync(
    existing: list[ExistingAssignment],
    desired: list[AssignmentInput],
) -> tuple[list[AssignmentInput], list[ExistingAssignment]]:
    desired_keys = {_assignment_key(item.class_id, item.subject_id) for item in desired}
    existing_keys = {_assignment_key(item.class_id, item.subject_id) for item in existing}

    to_remove = [
        item
        for item in existing
        if _assignment_key(item.class_id, item.subject_id) not in desired_keys
    ]
    to_add = [
        item
        for item in desired
        if _assignment_key(item.class_id, item.subject_id) not in existing_keys
    ]
    return to_add, to_remove


def _preview_to_dict(preview: AssignmentSyncPreview) -> dict[str, Any]:
    return {
        "to_add": [
            {"class_id": str(a.class_id), "subject_id": str(a.subject_id) if a.subject_id else None}
            for a in preview.to_add
        ],
        "to_remove": [
            {
                "id": str(r.id),
                "class_id": str(r.class_id),
                "subject_id": str(r.subject_id) if r.subject_id else None,
            }
            for r in preview.to_remove
        ],
        "warnings": [
            {
                "class_id": str(w.class_id),
                "class_name": w.class_name,
                "status": w.status,
                "message": w.message,
            }
            for w in preview.warnings
        ],
        "blocks": [
            {
                "class_id": str(b.class_id),
                "class_name": b.class_name,
                "status": b.status,
                "reason": b.reason,
            }
            for b in preview.blocks
        ],
    }


async def preview_assignment_sync(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
    desired: list[AssignmentInput],
) -> AssignmentSyncPreview:
    existing = await _fetch_existing_assignments(conn, school_id, teacher_id)
    to_add, to_remove = plan_assignment_sync(existing, desired)
    term_id = await get_current_term_id(conn, school_id)
    vacated = _fully_vacated_class_ids(to_remove, desired)
    blocks, warnings = await _inspect_class_detach_impact(
        conn, school_id, teacher_id, vacated, term_id
    )
    return AssignmentSyncPreview(
        to_add=to_add,
        to_remove=to_remove,
        warnings=warnings,
        blocks=blocks,
    )


async def sync_teacher_assignments(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
    assigned_by: uuid.UUID,
    desired: list[AssignmentInput],
    *,
    acknowledge_warnings: bool = False,
) -> dict[str, Any]:
    preview = await preview_assignment_sync(conn, school_id, teacher_id, desired)
    preview_dict = _preview_to_dict(preview)

    if preview.blocks:
        fields = {"assignments": " ".join(b.reason for b in preview.blocks)}
        return {
            "ok": False,
            "code": "ASSIGNMENT_LOCKED",
            "error": (
                "One or more classes cannot be removed because marks have already been "
                "submitted for the current term."
            ),
            "fields": fields,
            "preview": preview_dict,
        }

    if preview.warnings and not acknowledge_warnings:
        return {
            "ok": False,
            "code": "ASSIGNMENT_CONFIRM_REQUIRED",
            "error": "Confirm assignment changes to detach this teacher from in-progress work.",
            "preview": preview_dict,
        }

    for row in preview.to_remove:
        await conn.execute(
            "DELETE FROM teacher_class_assignments WHERE id = $1",
            row.id,
        )

    for item in preview.to_add:
        if item.subject_id:
            # One teacher per subject slot: displace any other teacher holding it.
            await conn.execute(
                """
                DELETE FROM teacher_class_assignments
                WHERE school_id = $1 AND class_id = $2 AND subject_id = $3 AND teacher_id <> $4
                """,
                school_id,
                item.class_id,
                item.subject_id,
                teacher_id,
            )
        await conn.execute(
            """
            INSERT INTO teacher_class_assignments
              (id, school_id, teacher_id, class_id, subject_id, assigned_by, assigned_at)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
            ON CONFLICT (school_id, teacher_id, class_id, subject_id) DO NOTHING
            """,
            school_id,
            teacher_id,
            item.class_id,
            item.subject_id,
            assigned_by,
        )

    return {"ok": True, "preview": preview_dict}


async def scaffold_term_submissions(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
    assignments: list[AssignmentInput],
) -> None:
    term_id = await get_current_term_id(conn, school_id)
    if not term_id:
        return

    class_ids = list({item.class_id for item in assignments})
    for class_id in class_ids:
        await conn.execute(
            """
            INSERT INTO teacher_term_submissions (school_id, teacher_id, class_id, term_id, status)
            VALUES ($1, $2, $3, $4, 'pending')
            ON CONFLICT (school_id, teacher_id, class_id, term_id) DO NOTHING
            """,
            school_id,
            teacher_id,
            class_id,
            term_id,
        )
