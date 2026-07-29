"""Teaching plans and subject resources — DB + storage orchestration."""

from __future__ import annotations

import uuid
from typing import Any

import asyncpg

from app.config import settings
from app.lib.resource_validation import (
    extension_for_mime,
    infer_resource_type,
    normalize_mime,
    validate_subject_resource_file,
    validate_teaching_plan_file,
)
from app.lib.teacher_assignments import format_class_name
from app.services.storage import get_tenant_storage
from app.services.storage.keys import build_object_key


def _actor_user_id(actor: dict[str, Any]) -> uuid.UUID:
    return uuid.UUID(str(actor.get("user_db_id") or actor["sub"]))


def _is_admin(actor: dict[str, Any]) -> bool:
    return (actor.get("role") or "").lower() in {"admin", "head_teacher"}


def _is_teacher(actor: dict[str, Any]) -> bool:
    return (actor.get("role") or "").lower() == "teacher"


def _is_learner(actor: dict[str, Any]) -> bool:
    return (actor.get("role") or "").lower() in {"learner", "student"}


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def serialize_teaching_plan(row: asyncpg.Record) -> dict[str, Any]:
    class_name = None
    if row.get("level") is not None:
        class_name = format_class_name(row["level"], row.get("stream"))
    return {
        "id": str(row["id"]),
        "schoolId": str(row["school_id"]),
        "teacherId": str(row["teacher_id"]),
        "teacherName": row.get("teacher_name"),
        "classId": str(row["class_id"]),
        "className": class_name,
        "subjectId": str(row["subject_id"]),
        "subjectName": row.get("subject_name"),
        "termId": str(row["term_id"]),
        "termName": row.get("term_name"),
        "title": row["title"],
        "description": row.get("description"),
        "fileName": row["file_name"],
        "fileSize": int(row["file_size"]),
        "fileType": row["file_type"],
        "status": row["status"],
        "uploadedAt": _iso(row.get("uploaded_at")),
        "createdAt": _iso(row.get("created_at")),
        "updatedAt": _iso(row.get("updated_at")),
    }


def serialize_subject_resource(row: asyncpg.Record) -> dict[str, Any]:
    class_name = None
    if row.get("level") is not None:
        class_name = format_class_name(row["level"], row.get("stream"))
    return {
        "id": str(row["id"]),
        "schoolId": str(row["school_id"]),
        "teacherId": str(row["teacher_id"]),
        "teacherName": row.get("teacher_name"),
        "classId": str(row["class_id"]),
        "className": class_name,
        "subjectId": str(row["subject_id"]),
        "subjectName": row.get("subject_name"),
        "termId": str(row["term_id"]) if row.get("term_id") else None,
        "termName": row.get("term_name"),
        "title": row["title"],
        "description": row.get("description"),
        "resourceType": row["resource_type"],
        "fileName": row["file_name"],
        "fileSize": int(row["file_size"]),
        "fileType": row["file_type"],
        "isPublished": bool(row["is_published"]),
        "status": row["status"],
        "sortOrder": int(row["sort_order"] or 0),
        "publishedAt": _iso(row.get("published_at")),
        "uploadedAt": _iso(row.get("uploaded_at")),
        "createdAt": _iso(row.get("created_at")),
        "updatedAt": _iso(row.get("updated_at")),
    }


_PLAN_SELECT = """
SELECT
  tp.*,
  u.full_name AS teacher_name,
  sc.level,
  sc.stream,
  ss.name AS subject_name,
  t.name AS term_name
FROM teaching_plans tp
JOIN users u ON u.id = tp.teacher_id
JOIN school_classes sc ON sc.id = tp.class_id
JOIN school_subjects ss ON ss.id = tp.subject_id
JOIN terms t ON t.id = tp.term_id
"""

_RESOURCE_SELECT = """
SELECT
  sr.*,
  u.full_name AS teacher_name,
  sc.level,
  sc.stream,
  ss.name AS subject_name,
  t.name AS term_name
FROM subject_resources sr
JOIN users u ON u.id = sr.teacher_id
JOIN school_classes sc ON sc.id = sr.class_id
JOIN school_subjects ss ON ss.id = sr.subject_id
LEFT JOIN terms t ON t.id = sr.term_id
"""


async def _assert_teacher_assignment(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
    class_id: uuid.UUID,
    subject_id: uuid.UUID,
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
        raise PermissionError(
            "You can only upload for classes and subjects assigned to you."
        )


async def _academic_year_for_term(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    term_id: uuid.UUID,
) -> uuid.UUID:
    row = await conn.fetchrow(
        """
        SELECT academic_year_id
        FROM terms
        WHERE id = $1 AND school_id = $2
        """,
        term_id,
        school_id,
    )
    if not row:
        raise ValueError("Term not found.")
    return row["academic_year_id"]


async def _resolve_learner_class(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    user_id: uuid.UUID,
) -> uuid.UUID | None:
    from app.services.students.accounts import resolve_student_for_user

    student = await resolve_student_for_user(conn, school_id=school_id, user_id=user_id)
    if not student:
        return None
    return student["current_class_id"]


def _local_upload_url(key: str) -> str:
    from urllib.parse import quote

    return f"/api/schools/resources/local-upload?key={quote(key, safe='')}"


async def _build_upload_payload(
    school_id: uuid.UUID,
    key: str,
    content_type: str,
) -> dict[str, Any]:
    storage = get_tenant_storage()
    if settings.use_local_storage:
        return {
            "method": "PUT",
            "url": _local_upload_url(key),
            "key": key,
            "headers": {"Content-Type": content_type},
            "expires_in": settings.STORAGE_PRESIGNED_TTL_SECONDS,
        }
    return await storage.presigned_upload_url_for_key(
        school_id,
        key,
        content_type,
        expires_in=settings.STORAGE_PRESIGNED_TTL_SECONDS,
    )


# ── Teaching plans ──────────────────────────────────────────────────────────


async def request_teaching_plan_upload(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor: dict[str, Any],
    *,
    class_id: uuid.UUID,
    subject_id: uuid.UUID,
    term_id: uuid.UUID,
    title: str,
    description: str | None,
    filename: str,
    file_size: int,
    file_type: str,
) -> dict[str, Any]:
    if not _is_teacher(actor):
        raise PermissionError("Teaching plans can only be uploaded by teachers.")

    teacher_id = _actor_user_id(actor)

    error = validate_teaching_plan_file(
        filename=filename, file_type=file_type, file_size=file_size
    )
    if error:
        raise ValueError(error)

    await _assert_teacher_assignment(conn, school_id, teacher_id, class_id, subject_id)
    academic_year_id = await _academic_year_for_term(conn, school_id, term_id)

    mime = normalize_mime(file_type)
    ext = extension_for_mime(mime, filename)
    file_id = uuid.uuid4()
    key = build_object_key(
        school_id,
        "teaching-plans",
        str(academic_year_id),
        str(term_id),
        str(teacher_id),
        f"{file_id}{ext}",
    )

    # Soft-delete any previous pending for same combo owned by this teacher
    await conn.execute(
        """
        UPDATE teaching_plans
        SET status = 'deleted', updated_at = now()
        WHERE school_id = $1
          AND teacher_id = $2
          AND class_id = $3
          AND subject_id = $4
          AND term_id = $5
          AND status = 'pending'
        """,
        school_id,
        teacher_id,
        class_id,
        subject_id,
        term_id,
    )

    row = await conn.fetchrow(
        """
        INSERT INTO teaching_plans (
          school_id, teacher_id, class_id, subject_id, term_id,
          title, description, file_name, file_size, file_type, storage_key, status
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending')
        RETURNING id
        """,
        school_id,
        teacher_id,
        class_id,
        subject_id,
        term_id,
        title.strip(),
        (description or "").strip() or None,
        filename,
        file_size,
        mime,
        key,
    )

    existing = await conn.fetchrow(
        """
        SELECT id FROM teaching_plans
        WHERE school_id = $1 AND teacher_id = $2 AND class_id = $3
          AND subject_id = $4 AND term_id = $5 AND status = 'active'
        LIMIT 1
        """,
        school_id,
        teacher_id,
        class_id,
        subject_id,
        term_id,
    )

    upload = await _build_upload_payload(school_id, key, mime)
    return {
        "resourceId": str(row["id"]),
        "replacesExisting": existing is not None,
        **upload,
    }


async def confirm_teaching_plan(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor: dict[str, Any],
    plan_id: uuid.UUID,
) -> dict[str, Any]:
    if not _is_teacher(actor):
        raise PermissionError("Only the uploading teacher can confirm a plan.")
    teacher_id = _actor_user_id(actor)

    row = await conn.fetchrow(
        """
        SELECT * FROM teaching_plans
        WHERE id = $1 AND school_id = $2 AND status = 'pending'
        """,
        plan_id,
        school_id,
    )
    if not row:
        raise LookupError("Pending teaching plan not found.")
    if row["teacher_id"] != teacher_id:
        raise PermissionError("You can only confirm your own teaching plans.")

    storage = get_tenant_storage()
    if not await storage.exists(school_id, row["storage_key"]):
        raise RuntimeError("UPLOAD_INCOMPLETE")

    # Soft-delete previous active + remove Wasabi object
    previous = await conn.fetch(
        """
        SELECT id, storage_key FROM teaching_plans
        WHERE school_id = $1 AND teacher_id = $2 AND class_id = $3
          AND subject_id = $4 AND term_id = $5 AND status = 'active' AND id <> $6
        """,
        school_id,
        teacher_id,
        row["class_id"],
        row["subject_id"],
        row["term_id"],
        plan_id,
    )
    for prev in previous:
        await conn.execute(
            """
            UPDATE teaching_plans
            SET status = 'deleted', updated_at = now()
            WHERE id = $1
            """,
            prev["id"],
        )
        try:
            await storage.delete(school_id, prev["storage_key"])
        except Exception:
            pass

    await conn.execute(
        """
        UPDATE teaching_plans
        SET status = 'active', uploaded_at = now(), updated_at = now()
        WHERE id = $1
        """,
        plan_id,
    )

    full = await conn.fetchrow(
        f"{_PLAN_SELECT} WHERE tp.id = $1 AND tp.school_id = $2",
        plan_id,
        school_id,
    )
    return serialize_teaching_plan(full)


async def list_teaching_plans(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor: dict[str, Any],
    *,
    class_id: uuid.UUID | None = None,
    term_id: uuid.UUID | None = None,
    teacher_id: uuid.UUID | None = None,
    subject_id: uuid.UUID | None = None,
) -> list[dict[str, Any]]:
    if _is_learner(actor):
        raise PermissionError("Students cannot access teaching plans.")

    conditions = ["tp.school_id = $1", "tp.status = 'active'"]
    args: list[Any] = [school_id]
    idx = 2

    if _is_teacher(actor) and not _is_admin(actor):
        conditions.append(f"tp.teacher_id = ${idx}")
        args.append(_actor_user_id(actor))
        idx += 1
    elif teacher_id:
        conditions.append(f"tp.teacher_id = ${idx}")
        args.append(teacher_id)
        idx += 1

    if class_id:
        conditions.append(f"tp.class_id = ${idx}")
        args.append(class_id)
        idx += 1
    if term_id:
        conditions.append(f"tp.term_id = ${idx}")
        args.append(term_id)
        idx += 1
    if subject_id:
        conditions.append(f"tp.subject_id = ${idx}")
        args.append(subject_id)
        idx += 1

    where = " AND ".join(conditions)
    rows = await conn.fetch(
        f"""
        {_PLAN_SELECT}
        WHERE {where}
        ORDER BY tp.uploaded_at DESC NULLS LAST, tp.created_at DESC
        """,
        *args,
    )
    return [serialize_teaching_plan(r) for r in rows]


async def teaching_plan_download_url(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor: dict[str, Any],
    plan_id: uuid.UUID,
) -> dict[str, Any]:
    if _is_learner(actor):
        raise PermissionError("Students cannot download teaching plans.")

    row = await conn.fetchrow(
        """
        SELECT * FROM teaching_plans
        WHERE id = $1 AND school_id = $2 AND status = 'active'
        """,
        plan_id,
        school_id,
    )
    if not row:
        raise LookupError("Teaching plan not found.")

    if _is_teacher(actor) and not _is_admin(actor):
        if row["teacher_id"] != _actor_user_id(actor):
            raise PermissionError("You can only download your own teaching plans.")

    storage = get_tenant_storage()
    url = await storage.presigned_download_url(school_id, row["storage_key"])
    return {
        "url": url,
        "expiresIn": settings.STORAGE_PRESIGNED_TTL_SECONDS,
        "fileName": row["file_name"],
    }


async def patch_teaching_plan(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor: dict[str, Any],
    plan_id: uuid.UUID,
    *,
    title: str | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    row = await conn.fetchrow(
        """
        SELECT * FROM teaching_plans
        WHERE id = $1 AND school_id = $2 AND status = 'active'
        """,
        plan_id,
        school_id,
    )
    if not row:
        raise LookupError("Teaching plan not found.")

    # Only the uploading teacher may edit metadata (admin is read-only)
    if not _is_teacher(actor) or row["teacher_id"] != _actor_user_id(actor):
        raise PermissionError("You can only edit your own teaching plans.")

    new_title = title.strip() if title is not None else row["title"]
    if not new_title:
        raise ValueError("Title is required.")
    new_desc = (
        description.strip() if description is not None else row["description"]
    )
    if description is not None and not new_desc:
        new_desc = None

    await conn.execute(
        """
        UPDATE teaching_plans
        SET title = $2, description = $3, updated_at = now()
        WHERE id = $1
        """,
        plan_id,
        new_title,
        new_desc,
    )
    full = await conn.fetchrow(
        f"{_PLAN_SELECT} WHERE tp.id = $1 AND tp.school_id = $2",
        plan_id,
        school_id,
    )
    return serialize_teaching_plan(full)


async def delete_teaching_plan(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor: dict[str, Any],
    plan_id: uuid.UUID,
) -> None:
    row = await conn.fetchrow(
        """
        SELECT * FROM teaching_plans
        WHERE id = $1 AND school_id = $2 AND status IN ('pending', 'active')
        """,
        plan_id,
        school_id,
    )
    if not row:
        raise LookupError("Teaching plan not found.")

    # Teaching plans are teacher-owned — only the uploader may delete
    if not _is_teacher(actor) or row["teacher_id"] != _actor_user_id(actor):
        raise PermissionError("You can only delete your own teaching plans.")

    await conn.execute(
        """
        UPDATE teaching_plans
        SET status = 'deleted', updated_at = now()
        WHERE id = $1
        """,
        plan_id,
    )
    try:
        await get_tenant_storage().delete(school_id, row["storage_key"])
    except Exception:
        pass


async def teaching_plan_compliance(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor: dict[str, Any],
    term_id: uuid.UUID,
) -> dict[str, Any]:
    if not _is_admin(actor):
        raise PermissionError("Only admins can view teaching plan compliance.")

    term = await conn.fetchrow(
        "SELECT id, name FROM terms WHERE id = $1 AND school_id = $2",
        term_id,
        school_id,
    )
    if not term:
        raise LookupError("Term not found.")

    # Teachers who have at least one class×subject assignment
    teachers = await conn.fetch(
        """
        SELECT DISTINCT u.id, u.full_name
        FROM users u
        JOIN teacher_class_assignments tca ON tca.teacher_id = u.id AND tca.school_id = u.school_id
        WHERE u.school_id = $1 AND u.role = 'teacher' AND COALESCE(u.is_active, true) = true
        ORDER BY u.full_name
        """,
        school_id,
    )

    uploaded = await conn.fetch(
        """
        SELECT DISTINCT teacher_id
        FROM teaching_plans
        WHERE school_id = $1 AND term_id = $2 AND status = 'active'
        """,
        school_id,
        term_id,
    )
    uploaded_ids = {r["teacher_id"] for r in uploaded}

    missing = [
        {"id": str(t["id"]), "fullName": t["full_name"]}
        for t in teachers
        if t["id"] not in uploaded_ids
    ]
    uploaded_count = len(teachers) - len(missing)

    return {
        "termId": str(term["id"]),
        "termName": term["name"],
        "totalTeachers": len(teachers),
        "uploadedCount": uploaded_count,
        "missingTeachers": missing,
    }


# ── Subject resources ───────────────────────────────────────────────────────


async def request_subject_resource_upload(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor: dict[str, Any],
    *,
    class_id: uuid.UUID,
    subject_id: uuid.UUID,
    term_id: uuid.UUID | None,
    title: str,
    description: str | None,
    filename: str,
    file_size: int,
    file_type: str,
) -> dict[str, Any]:
    if not _is_teacher(actor):
        raise PermissionError("Only teachers can upload subject resources.")

    teacher_id = _actor_user_id(actor)
    error = validate_subject_resource_file(
        filename=filename, file_type=file_type, file_size=file_size
    )
    if error:
        raise ValueError(error)

    await _assert_teacher_assignment(conn, school_id, teacher_id, class_id, subject_id)
    if term_id:
        await _academic_year_for_term(conn, school_id, term_id)

    mime = normalize_mime(file_type)
    resource_type = infer_resource_type(mime)
    ext = extension_for_mime(mime, filename)
    file_id = uuid.uuid4()
    key = build_object_key(
        school_id,
        "resources",
        str(class_id),
        str(subject_id),
        f"{file_id}{ext}",
    )

    max_sort = await conn.fetchval(
        """
        SELECT COALESCE(MAX(sort_order), 0)
        FROM subject_resources
        WHERE school_id = $1 AND teacher_id = $2 AND class_id = $3
          AND subject_id = $4 AND status IN ('pending', 'active')
        """,
        school_id,
        teacher_id,
        class_id,
        subject_id,
    )

    row = await conn.fetchrow(
        """
        INSERT INTO subject_resources (
          school_id, teacher_id, class_id, subject_id, term_id,
          title, description, resource_type, file_name, file_size, file_type,
          storage_key, is_published, status, sort_order
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,'pending',$13)
        RETURNING id
        """,
        school_id,
        teacher_id,
        class_id,
        subject_id,
        term_id,
        title.strip(),
        (description or "").strip() or None,
        resource_type,
        filename,
        file_size,
        mime,
        key,
        int(max_sort or 0) + 1,
    )

    upload = await _build_upload_payload(school_id, key, mime)
    return {"resourceId": str(row["id"]), **upload}


async def confirm_subject_resource(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor: dict[str, Any],
    resource_id: uuid.UUID,
) -> dict[str, Any]:
    if not _is_teacher(actor):
        raise PermissionError("Only the uploading teacher can confirm a resource.")
    teacher_id = _actor_user_id(actor)

    row = await conn.fetchrow(
        """
        SELECT * FROM subject_resources
        WHERE id = $1 AND school_id = $2 AND status = 'pending'
        """,
        resource_id,
        school_id,
    )
    if not row:
        raise LookupError("Pending resource not found.")
    if row["teacher_id"] != teacher_id:
        raise PermissionError("You can only confirm your own resources.")

    storage = get_tenant_storage()
    if not await storage.exists(school_id, row["storage_key"]):
        raise RuntimeError("UPLOAD_INCOMPLETE")

    await conn.execute(
        """
        UPDATE subject_resources
        SET status = 'active', uploaded_at = now(), updated_at = now()
        WHERE id = $1
        """,
        resource_id,
    )
    full = await conn.fetchrow(
        f"{_RESOURCE_SELECT} WHERE sr.id = $1 AND sr.school_id = $2",
        resource_id,
        school_id,
    )
    return serialize_subject_resource(full)


async def list_subject_resources(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor: dict[str, Any],
    *,
    class_id: uuid.UUID | None = None,
    subject_id: uuid.UUID | None = None,
    term_id: uuid.UUID | None = None,
) -> list[dict[str, Any]]:
    conditions = ["sr.school_id = $1", "sr.status = 'active'"]
    args: list[Any] = [school_id]
    idx = 2

    if _is_learner(actor):
        learner_class = await _resolve_learner_class(
            conn, school_id, _actor_user_id(actor)
        )
        if not learner_class:
            raise PermissionError("No class enrollment found for this learner.")
        if class_id and class_id != learner_class:
            raise PermissionError("You can only view resources for your class.")
        conditions.append(f"sr.class_id = ${idx}")
        args.append(learner_class)
        idx += 1
        conditions.append("sr.is_published = true")
    elif _is_teacher(actor) and not _is_admin(actor):
        conditions.append(f"sr.teacher_id = ${idx}")
        args.append(_actor_user_id(actor))
        idx += 1
        if class_id:
            conditions.append(f"sr.class_id = ${idx}")
            args.append(class_id)
            idx += 1
    else:
        if class_id:
            conditions.append(f"sr.class_id = ${idx}")
            args.append(class_id)
            idx += 1

    if subject_id:
        conditions.append(f"sr.subject_id = ${idx}")
        args.append(subject_id)
        idx += 1
    if term_id:
        conditions.append(f"(sr.term_id IS NULL OR sr.term_id = ${idx})")
        args.append(term_id)
        idx += 1

    where = " AND ".join(conditions)
    rows = await conn.fetch(
        f"""
        {_RESOURCE_SELECT}
        WHERE {where}
        ORDER BY sr.sort_order ASC, sr.created_at DESC
        """,
        *args,
    )
    return [serialize_subject_resource(r) for r in rows]


async def subject_resource_download_url(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor: dict[str, Any],
    resource_id: uuid.UUID,
) -> dict[str, Any]:
    row = await conn.fetchrow(
        """
        SELECT * FROM subject_resources
        WHERE id = $1 AND school_id = $2 AND status = 'active'
        """,
        resource_id,
        school_id,
    )
    if not row:
        raise LookupError("Resource not found.")

    if _is_learner(actor):
        if not row["is_published"]:
            raise PermissionError("This resource is not published.")
        learner_class = await _resolve_learner_class(
            conn, school_id, _actor_user_id(actor)
        )
        if not learner_class or learner_class != row["class_id"]:
            raise PermissionError("You can only download resources for your class.")
    elif _is_teacher(actor) and not _is_admin(actor):
        if row["teacher_id"] != _actor_user_id(actor):
            raise PermissionError("You can only download your own resources.")

    ttl = settings.STORAGE_PRESIGNED_TTL_SECONDS
    if row["resource_type"] == "video":
        ttl = settings.STORAGE_VIDEO_PRESIGNED_TTL_SECONDS

    storage = get_tenant_storage()
    url = await storage.presigned_download_url(
        school_id, row["storage_key"], expires_in=ttl
    )
    return {
        "url": url,
        "expiresIn": ttl,
        "fileName": row["file_name"],
        "resourceType": row["resource_type"],
    }


async def patch_subject_resource(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor: dict[str, Any],
    resource_id: uuid.UUID,
    *,
    title: str | None = None,
    description: str | None = None,
    sort_order: int | None = None,
) -> dict[str, Any]:
    row = await conn.fetchrow(
        """
        SELECT * FROM subject_resources
        WHERE id = $1 AND school_id = $2 AND status = 'active'
        """,
        resource_id,
        school_id,
    )
    if not row:
        raise LookupError("Resource not found.")

    if not _is_admin(actor):
        if not _is_teacher(actor) or row["teacher_id"] != _actor_user_id(actor):
            raise PermissionError("You can only edit your own resources.")

    new_title = title.strip() if title is not None else row["title"]
    if not new_title:
        raise ValueError("Title is required.")
    new_desc = row["description"]
    if description is not None:
        new_desc = description.strip() or None
    new_sort = sort_order if sort_order is not None else row["sort_order"]

    await conn.execute(
        """
        UPDATE subject_resources
        SET title = $2, description = $3, sort_order = $4, updated_at = now()
        WHERE id = $1
        """,
        resource_id,
        new_title,
        new_desc,
        new_sort,
    )
    full = await conn.fetchrow(
        f"{_RESOURCE_SELECT} WHERE sr.id = $1 AND sr.school_id = $2",
        resource_id,
        school_id,
    )
    return serialize_subject_resource(full)


async def set_resource_visibility(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor: dict[str, Any],
    resource_id: uuid.UUID,
    is_published: bool,
) -> dict[str, Any]:
    if not _is_teacher(actor):
        raise PermissionError("Only the uploading teacher can change visibility.")
    teacher_id = _actor_user_id(actor)

    row = await conn.fetchrow(
        """
        SELECT * FROM subject_resources
        WHERE id = $1 AND school_id = $2 AND status = 'active'
        """,
        resource_id,
        school_id,
    )
    if not row:
        raise LookupError("Resource not found.")
    if row["teacher_id"] != teacher_id:
        raise PermissionError("You can only change visibility of your own resources.")

    if is_published and row["published_at"] is None:
        await conn.execute(
            """
            UPDATE subject_resources
            SET is_published = true, published_at = now(), updated_at = now()
            WHERE id = $1
            """,
            resource_id,
        )
    else:
        await conn.execute(
            """
            UPDATE subject_resources
            SET is_published = $2, updated_at = now()
            WHERE id = $1
            """,
            resource_id,
            is_published,
        )

    full = await conn.fetchrow(
        f"{_RESOURCE_SELECT} WHERE sr.id = $1 AND sr.school_id = $2",
        resource_id,
        school_id,
    )
    return serialize_subject_resource(full)


async def reorder_subject_resources(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor: dict[str, Any],
    resource_ids: list[uuid.UUID],
) -> list[dict[str, Any]]:
    if not _is_teacher(actor):
        raise PermissionError("Only teachers can reorder resources.")
    teacher_id = _actor_user_id(actor)

    for index, rid in enumerate(resource_ids):
        result = await conn.execute(
            """
            UPDATE subject_resources
            SET sort_order = $3, updated_at = now()
            WHERE id = $1 AND school_id = $2 AND teacher_id = $4 AND status = 'active'
            """,
            rid,
            school_id,
            index,
            teacher_id,
        )
        if result == "UPDATE 0":
            raise LookupError("One or more resources were not found.")

    rows = await conn.fetch(
        f"""
        {_RESOURCE_SELECT}
        WHERE sr.school_id = $1 AND sr.teacher_id = $2 AND sr.status = 'active'
          AND sr.id = ANY($3::uuid[])
        ORDER BY sr.sort_order ASC
        """,
        school_id,
        teacher_id,
        resource_ids,
    )
    return [serialize_subject_resource(r) for r in rows]


async def delete_subject_resource(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor: dict[str, Any],
    resource_id: uuid.UUID,
) -> None:
    row = await conn.fetchrow(
        """
        SELECT * FROM subject_resources
        WHERE id = $1 AND school_id = $2 AND status IN ('pending', 'active')
        """,
        resource_id,
        school_id,
    )
    if not row:
        raise LookupError("Resource not found.")

    if not _is_admin(actor):
        if not _is_teacher(actor) or row["teacher_id"] != _actor_user_id(actor):
            raise PermissionError("You can only delete your own resources.")

    await conn.execute(
        """
        UPDATE subject_resources
        SET is_published = false, status = 'deleted', updated_at = now()
        WHERE id = $1
        """,
        resource_id,
    )
    try:
        await get_tenant_storage().delete(school_id, row["storage_key"])
    except Exception:
        pass
