from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import UploadFile

from app.config import settings
from app.services.storage import get_tenant_storage
from app.services.storage.keys import is_storage_object_key, legacy_path_to_key
from app.services.storage.service import (  # noqa: F401 — re-exported for routers
    ALLOWED_IMAGE_TYPES,
    ALLOWED_STUDENT_PHOTO_TYPES,
)

_EXT_BY_MIME = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


async def save_school_image(
    school_id: uuid.UUID,
    file: UploadFile,
    *,
    category: str,
) -> str:
    """Upload a school logo or stamp; returns the object key stored in the database."""
    storage = get_tenant_storage()
    return await storage.upload_upload_file(school_id, category, file)


async def save_student_photo(
    school_id: uuid.UUID,
    student_id: uuid.UUID,
    content: bytes,
    content_type: str,
) -> str:
    """Upload a student profile photo; returns the object key stored in the database.

    Uses a unique object key per upload so replacements are not served from a
    stale CDN/browser cache of a fixed ``profile.jpg`` key.
    """
    storage = get_tenant_storage()
    normalized = content_type.lower().split(";")[0].strip()
    ext = _EXT_BY_MIME.get(normalized, ".jpg")
    filename = f"profile-{uuid.uuid4().hex}{ext}"
    return await storage.upload_bytes(
        school_id,
        "students",
        content,
        content_type,
        str(student_id),
        filename,
    )


async def replace_student_photo(
    school_id: uuid.UUID,
    student_id: uuid.UUID,
    content: bytes,
    content_type: str,
    *,
    previous_photo_url: str | None,
) -> str:
    """Upload a new profile photo and delete the previous stored object when different."""
    new_key = await save_student_photo(school_id, student_id, content, content_type)
    if previous_photo_url and previous_photo_url != new_key:
        await delete_stored_object(school_id, previous_photo_url)
    return new_key



def _normalize_delete_target(stored_value: str) -> tuple[str | None, Path | None]:
    if is_storage_object_key(stored_value):
        return stored_value, None
    legacy_key = legacy_path_to_key(stored_value)
    if legacy_key:
        return legacy_key, None
    if stored_value.startswith("/uploads/"):
        relative = stored_value[len("/uploads/") :]
        return None, Path(settings.UPLOAD_DIR) / relative
    return None, None


async def delete_stored_object(school_id: uuid.UUID, stored_value: str | None) -> None:
    if not stored_value:
        return
    key, legacy_path = _normalize_delete_target(stored_value)
    if key:
        storage = get_tenant_storage()
        try:
            await storage.delete(school_id, key)
        except Exception:
            pass
    elif legacy_path and legacy_path.is_file():
        legacy_path.unlink(missing_ok=True)
