from __future__ import annotations

import logging
import shutil
from io import BytesIO
from pathlib import Path
from typing import Any, BinaryIO

from app.config import settings
from app.services.storage.errors import StorageError, StorageNotFoundError

logger = logging.getLogger("makyschool.storage")


class LocalStorageBackend:
    """Filesystem storage for development and fallback."""

    def __init__(self, root_dir: str | None = None):
        self._root = Path(root_dir or settings.UPLOAD_DIR)

    def _path_for_key(self, key: str) -> Path:
        return self._root / key

    def upload(
        self,
        key: str,
        fileobj: BinaryIO,
        *,
        content_type: str,
        content_length: int | None = None,
    ) -> None:
        destination = self._path_for_key(key)
        destination.parent.mkdir(parents=True, exist_ok=True)
        try:
            with destination.open("wb") as handle:
                shutil.copyfileobj(fileobj, handle)
            logger.info("Stored object locally key=%s bytes=%s", key, content_length)
        except OSError as exc:
            raise StorageError("Failed to store file", code="STORAGE_UPLOAD_FAILED") from exc

    def delete(self, key: str) -> None:
        path = self._path_for_key(key)
        if not path.exists():
            return
        try:
            path.unlink()
            logger.info("Deleted local object key=%s", key)
        except OSError as exc:
            raise StorageError("Failed to delete file", code="STORAGE_DELETE_FAILED") from exc

    def exists(self, key: str) -> bool:
        return self._path_for_key(key).is_file()

    def download_bytes(self, key: str) -> tuple[bytes, str | None]:
        path = self._path_for_key(key)
        if not path.is_file():
            raise StorageNotFoundError()
        try:
            data = path.read_bytes()
        except OSError as exc:
            raise StorageError("Failed to read file", code="STORAGE_DOWNLOAD_FAILED") from exc
        suffix = path.suffix.lower()
        content_type = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
            ".gif": "image/gif",
        }.get(suffix)
        return data, content_type

    def get_metadata(self, key: str) -> dict[str, Any]:
        path = self._path_for_key(key)
        if not path.is_file():
            raise StorageNotFoundError()
        stat = path.stat()
        return {
            "key": key,
            "size": stat.st_size,
            "last_modified": stat.st_mtime,
        }

    def generate_presigned_download_url(self, key: str, *, expires_in: int = 3600) -> str:
        if not self.exists(key):
            raise StorageNotFoundError()
        return f"/uploads/{key}"

    def generate_presigned_upload_url(
        self,
        key: str,
        *,
        content_type: str,
        expires_in: int = 3600,
    ) -> dict[str, Any]:
        return {
            "method": "POST",
            "url": None,
            "key": key,
            "note": "Direct upload URLs are not supported for local storage; use multipart API routes.",
        }

    def copy(self, source_key: str, dest_key: str) -> None:
        source = self._path_for_key(source_key)
        if not source.is_file():
            raise StorageNotFoundError()
        dest = self._path_for_key(dest_key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, dest)

    def move(self, source_key: str, dest_key: str) -> None:
        self.copy(source_key, dest_key)
        self.delete(source_key)

    @staticmethod
    def upload_bytes(key: str, data: bytes, *, content_type: str) -> None:
        backend = LocalStorageBackend()
        backend.upload(key, BytesIO(data), content_type=content_type, content_length=len(data))
