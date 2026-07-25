from __future__ import annotations

import base64
import logging
import mimetypes
import uuid

from app.config import settings
from app.services.storage import get_tenant_storage
from app.services.storage.errors import StorageError, StorageNotFoundError
from app.services.storage.keys import (
    is_legacy_upload_path,
    is_storage_object_key,
    legacy_path_to_key,
)

logger = logging.getLogger("makyschool.storage")


def _stored_value_to_key(value: str, school_id: uuid.UUID | None) -> str | None:
    if is_storage_object_key(value):
        return value
    legacy_key = legacy_path_to_key(value)
    if legacy_key:
        return legacy_key
    if value.startswith("schools/"):
        return value
    return None


async def resolve_storage_url(
    stored_value: str | None,
    *,
    school_id: uuid.UUID | None = None,
    expires_in: int | None = None,
    require_exists: bool = False,
) -> str | None:
    """
    Turn a stored object key (or legacy /uploads path) into a client-accessible URL.
    Presigned for Wasabi; /uploads/... for local storage.

    When require_exists=True, missing objects return None instead of a broken URL.
    """
    if not stored_value or not stored_value.strip():
        return None

    value = stored_value.strip()
    if value.startswith("http://") or value.startswith("https://"):
        return value

    key = _stored_value_to_key(value, school_id)
    if not key:
        if is_legacy_upload_path(value):
            return value
        return value

    if school_id is None:
        logger.warning("Cannot resolve storage key without school_id key=%s", key)
        return value

    storage = get_tenant_storage()
    try:
        if require_exists and not await storage.exists(school_id, key):
            return None
        return await storage.presigned_download_url(
            school_id,
            key,
            expires_in=expires_in,
        )
    except StorageNotFoundError:
        return None
    except StorageError:
        logger.warning("Failed to resolve storage URL key=%s", key, exc_info=True)
        if settings.use_local_storage and is_storage_object_key(key):
            return f"/uploads/{key}"
        return None


async def resolve_storage_data_uri(
    stored_value: str | None,
    *,
    school_id: uuid.UUID,
) -> str | None:
    """Download a tenant object and return a data URI for offline PDF embedding."""
    if not stored_value or not stored_value.strip():
        return None

    value = stored_value.strip()
    if value.startswith("data:"):
        return value

    # Absolute http(s) URLs are not downloaded here — omit to avoid WeasyPrint fetches.
    if value.startswith("http://") or value.startswith("https://"):
        return None

    key = _stored_value_to_key(value, school_id)
    if not key:
        return None

    storage = get_tenant_storage()
    try:
        if not await storage.exists(school_id, key):
            return None
        data, content_type = await storage.download_bytes(school_id, key)
    except (StorageNotFoundError, StorageError):
        logger.warning("Failed to embed storage object key=%s", key, exc_info=True)
        return None

    if not data:
        return None

    mime = (content_type or "").split(";")[0].strip().lower()
    if not mime or mime == "application/octet-stream":
        guessed, _ = mimetypes.guess_type(key)
        mime = guessed or "image/jpeg"
    encoded = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{encoded}"


async def enrich_school_media(record: dict, school_id: uuid.UUID) -> dict:
    enriched = dict(record)
    for field in ("logo_url", "stamp_url"):
        if enriched.get(field):
            enriched[field] = await resolve_storage_url(
                enriched[field], school_id=school_id, require_exists=True
            )
    return enriched


async def enrich_student_media(record: dict, school_id: uuid.UUID) -> dict:
    enriched = dict(record)
    if enriched.get("photo_url"):
        enriched["photo_url"] = await resolve_storage_url(
            enriched["photo_url"],
            school_id=school_id,
            require_exists=True,
        )
    return enriched
