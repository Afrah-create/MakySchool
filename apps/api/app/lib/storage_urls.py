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


def _bytes_to_data_uri(data: bytes, content_type: str | None, *, hint: str | None = None) -> str | None:
    if not data:
        return None
    mime = (content_type or "").split(";")[0].strip().lower()
    if not mime or mime == "application/octet-stream":
        guessed, _ = mimetypes.guess_type(hint or "")
        mime = guessed or "image/jpeg"

    # WeasyPrint WebP support is inconsistent — convert to PNG when possible.
    if mime == "image/webp" or (hint or "").lower().endswith(".webp"):
        try:
            from io import BytesIO

            from PIL import Image

            img = Image.open(BytesIO(data))
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGBA")
            buf = BytesIO()
            img.save(buf, format="PNG")
            data = buf.getvalue()
            mime = "image/png"
        except Exception:
            logger.warning("WebP→PNG conversion failed hint=%s", hint, exc_info=True)

    if mime not in {"image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"}:
        mime = "image/jpeg"
    encoded = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def _key_from_http_url(url: str, school_id: uuid.UUID) -> str | None:
    """Best-effort extract of schools/{id}/... from a signed or public object URL."""
    marker = f"schools/{school_id}/"
    idx = url.find(marker)
    if idx < 0:
        # Some CDNs URL-encode the path.
        marker_enc = f"schools%2F{school_id}%2F"
        idx = url.find(marker_enc)
        if idx < 0:
            return None
        rest = url[idx:].split("?", 1)[0]
        from urllib.parse import unquote

        return unquote(rest)
    return url[idx:].split("?", 1)[0]


async def _download_http_to_data_uri(url: str) -> str | None:
    import httpx

    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            resp = await client.get(url)
            if resp.status_code >= 400:
                logger.warning(
                    "Failed to embed http image status=%s url=%s",
                    resp.status_code,
                    url[:120],
                )
                return None
            return _bytes_to_data_uri(
                resp.content,
                resp.headers.get("content-type"),
                hint=url.split("?", 1)[0],
            )
    except Exception:
        logger.warning("Failed to embed http image url=%s", url[:120], exc_info=True)
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

    # Absolute http(s): prefer extracting the object key, else download the URL.
    if value.startswith("http://") or value.startswith("https://"):
        key_from_url = _key_from_http_url(value, school_id)
        if key_from_url:
            embedded = await resolve_storage_data_uri(key_from_url, school_id=school_id)
            if embedded:
                return embedded
        return await _download_http_to_data_uri(value)

    key = _stored_value_to_key(value, school_id)
    if not key:
        logger.warning("Cannot embed storage value (unrecognised key) value=%s", value[:120])
        return None

    storage = get_tenant_storage()
    try:
        data, content_type = await storage.download_bytes(school_id, key)
    except (StorageNotFoundError, StorageError):
        logger.warning("Failed to embed storage object key=%s", key, exc_info=True)
        # Last resort: try a short-lived signed URL download.
        try:
            signed = await storage.presigned_download_url(school_id, key)
            return await _download_http_to_data_uri(signed)
        except Exception:
            return None

    return _bytes_to_data_uri(data, content_type, hint=key)


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
