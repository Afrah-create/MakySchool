from __future__ import annotations

import asyncio
import logging
import re
import time
import uuid
from io import BytesIO
from typing import Any, BinaryIO

from fastapi import UploadFile

from app.config import settings
from app.services.storage.base import StorageBackend
from app.services.storage.errors import StorageValidationError
from app.services.storage.keys import (
    SCHOOL_STORAGE_CATEGORIES,
    assert_tenant_key,
    build_object_key,
)

logger = logging.getLogger("makyschool.storage")

ALLOWED_IMAGE_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})
ALLOWED_STUDENT_PHOTO_TYPES = ALLOWED_IMAGE_TYPES

_EXT_BY_MIME = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

_FILENAME_SAFE = re.compile(r"[^a-zA-Z0-9._-]")


class TenantStorageService:
    """Tenant-scoped facade over a storage backend."""

    def __init__(self, backend: StorageBackend):
        self._backend = backend

    @staticmethod
    def _max_bytes() -> int:
        return settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    @staticmethod
    def _safe_filename(original: str) -> str:
        safe = _FILENAME_SAFE.sub("-", original.strip())
        return f"{int(time.time() * 1000)}-{safe or 'upload'}"

    def _validate_image_content_type(self, content_type: str) -> str:
        normalized = (content_type or "").lower().split(";")[0].strip()
        if normalized not in ALLOWED_IMAGE_TYPES:
            raise StorageValidationError("Only JPEG, PNG, and WebP images are allowed")
        return normalized

    async def _run(self, func, *args, **kwargs):
        return await asyncio.to_thread(func, *args, **kwargs)

    async def upload_bytes(
        self,
        school_id: uuid.UUID,
        category: str,
        data: bytes,
        content_type: str,
        *key_parts: str,
    ) -> str:
        if len(data) > self._max_bytes():
            raise StorageValidationError(
                f"File exceeds {settings.MAX_UPLOAD_SIZE_MB}MB limit",
            )
        content_type = self._validate_image_content_type(content_type)
        key = build_object_key(school_id, category, *key_parts)
        buffer = BytesIO(data)
        await self._run(
            self._backend.upload,
            key,
            buffer,
            content_type=content_type,
            content_length=len(data),
        )
        return key

    async def upload_upload_file(
        self,
        school_id: uuid.UUID,
        category: str,
        file: UploadFile,
        *key_parts: str,
    ) -> str:
        content_type = self._validate_image_content_type(file.content_type or "")
        data = await file.read()
        if len(data) > self._max_bytes():
            raise StorageValidationError(
                f"File exceeds {settings.MAX_UPLOAD_SIZE_MB}MB limit",
            )
        filename = self._safe_filename(file.filename or "upload")
        ext = _EXT_BY_MIME.get(content_type, "")
        if key_parts:
            parts = list(key_parts)
        else:
            parts = [filename if filename.endswith(ext) else f"{filename}{ext}"]
        return await self.upload_bytes(school_id, category, data, content_type, *parts)

    async def upload_stream(
        self,
        school_id: uuid.UUID,
        category: str,
        fileobj: BinaryIO,
        *,
        content_type: str,
        content_length: int,
        key_parts: tuple[str, ...] = (),
    ) -> str:
        if content_length > self._max_bytes():
            raise StorageValidationError(
                f"File exceeds {settings.MAX_UPLOAD_SIZE_MB}MB limit",
            )
        content_type = self._validate_image_content_type(content_type)
        key = build_object_key(school_id, category, *key_parts)
        await self._run(
            self._backend.upload,
            key,
            fileobj,
            content_type=content_type,
            content_length=content_length,
        )
        return key

    async def delete(self, school_id: uuid.UUID, key: str) -> None:
        normalized = assert_tenant_key(school_id, key)
        await self._run(self._backend.delete, normalized)

    async def replace(
        self,
        school_id: uuid.UUID,
        old_key: str | None,
        category: str,
        file: UploadFile,
        *key_parts: str,
    ) -> str:
        new_key = await self.upload_upload_file(school_id, category, file, *key_parts)
        if old_key and old_key != new_key:
            try:
                await self.delete(school_id, old_key)
            except Exception:
                logger.warning("Failed to delete replaced object key=%s", old_key, exc_info=True)
        return new_key

    async def exists(self, school_id: uuid.UUID, key: str) -> bool:
        normalized = assert_tenant_key(school_id, key)
        return await self._run(self._backend.exists, normalized)

    async def download_bytes(
        self, school_id: uuid.UUID, key: str
    ) -> tuple[bytes, str | None]:
        normalized = assert_tenant_key(school_id, key)
        return await self._run(self._backend.download_bytes, normalized)

    async def get_metadata(self, school_id: uuid.UUID, key: str) -> dict[str, Any]:
        normalized = assert_tenant_key(school_id, key)
        return await self._run(self._backend.get_metadata, normalized)

    async def presigned_download_url(
        self,
        school_id: uuid.UUID,
        key: str,
        *,
        expires_in: int | None = None,
    ) -> str:
        normalized = assert_tenant_key(school_id, key)
        ttl = expires_in or settings.STORAGE_PRESIGNED_TTL_SECONDS
        return await self._run(
            self._backend.generate_presigned_download_url,
            normalized,
            expires_in=ttl,
        )

    async def presigned_upload_url(
        self,
        school_id: uuid.UUID,
        category: str,
        filename: str,
        content_type: str,
        *,
        expires_in: int | None = None,
    ) -> dict[str, Any]:
        content_type = self._validate_image_content_type(content_type)
        safe_name = self._safe_filename(filename)
        key = build_object_key(school_id, category, safe_name)
        ttl = expires_in or settings.STORAGE_PRESIGNED_TTL_SECONDS
        return await self._run(
            self._backend.generate_presigned_upload_url,
            key,
            content_type=content_type,
            expires_in=ttl,
        )

    async def copy(
        self,
        school_id: uuid.UUID,
        source_key: str,
        dest_category: str,
        *dest_parts: str,
    ) -> str:
        normalized_source = assert_tenant_key(school_id, source_key)
        dest_key = build_object_key(school_id, dest_category, *dest_parts)
        await self._run(self._backend.copy, normalized_source, dest_key)
        return dest_key

    async def move(
        self,
        school_id: uuid.UUID,
        source_key: str,
        dest_category: str,
        *dest_parts: str,
    ) -> str:
        normalized_source = assert_tenant_key(school_id, source_key)
        dest_key = build_object_key(school_id, dest_category, *dest_parts)
        await self._run(self._backend.move, normalized_source, dest_key)
        return dest_key

    async def _put_marker(self, school_id: uuid.UUID, key: str) -> None:
        normalized = assert_tenant_key(school_id, key)
        await self._run(
            self._backend.upload,
            normalized,
            BytesIO(b""),
            content_type="application/octet-stream",
            content_length=0,
        )

    async def initialize_tenant_prefix(self, school_id: uuid.UUID) -> list[str]:
        """Create tenant folder markers under schools/{school_id}/ for each category."""
        keys: list[str] = []
        root_key = f"schools/{school_id}/.keep"
        await self._put_marker(school_id, root_key)
        keys.append(root_key)
        for category in SCHOOL_STORAGE_CATEGORIES:
            marker_key = build_object_key(school_id, category, ".keep")
            await self._put_marker(school_id, marker_key)
            keys.append(marker_key)
        logger.info(
            "Provisioned school storage school_id=%s categories=%d",
            school_id,
            len(SCHOOL_STORAGE_CATEGORIES),
        )
        return keys
