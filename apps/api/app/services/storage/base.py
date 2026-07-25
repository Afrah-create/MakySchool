from __future__ import annotations

from typing import Any, BinaryIO, Protocol


class StorageBackend(Protocol):
    """S3-compatible storage backend contract."""

    def upload(
        self,
        key: str,
        fileobj: BinaryIO,
        *,
        content_type: str,
        content_length: int | None = None,
    ) -> None: ...

    def delete(self, key: str) -> None: ...

    def exists(self, key: str) -> bool: ...

    def download_bytes(self, key: str) -> tuple[bytes, str | None]: ...

    def get_metadata(self, key: str) -> dict[str, Any]: ...

    def generate_presigned_download_url(self, key: str, *, expires_in: int = 3600) -> str: ...

    def generate_presigned_upload_url(
        self,
        key: str,
        *,
        content_type: str,
        expires_in: int = 3600,
    ) -> dict[str, Any]: ...

    def copy(self, source_key: str, dest_key: str) -> None: ...

    def move(self, source_key: str, dest_key: str) -> None: ...
