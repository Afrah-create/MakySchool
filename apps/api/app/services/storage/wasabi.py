from __future__ import annotations

import logging
from typing import Any, BinaryIO

from app.config import settings
from app.services.storage.errors import (
    StorageError,
    StorageNotFoundError,
)

logger = logging.getLogger("makyschool.storage")

_client: Any | None = None


def _import_boto():
    try:
        import boto3
        from botocore.config import Config
        from botocore.exceptions import BotoCoreError, ClientError
    except ImportError as exc:
        raise StorageError(
            "boto3 is required for Wasabi storage",
            code="STORAGE_CONFIG_ERROR",
        ) from exc
    return boto3, Config, ClientError, BotoCoreError


def _get_client():
    global _client
    if _client is None:
        boto3, Config, _, _ = _import_boto()
        _client = boto3.client(
            "s3",
            endpoint_url=settings.wasabi_endpoint_url,
            region_name=settings.WASABI_REGION,
            aws_access_key_id=settings.WASABI_ACCESS_KEY,
            aws_secret_access_key=settings.WASABI_SECRET_KEY,
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"},
            ),
        )
    return _client


def reset_wasabi_client_for_tests() -> None:
    global _client
    _client = None


class WasabiStorageBackend:
    def __init__(self, bucket: str | None = None):
        self._bucket = bucket or settings.WASABI_BUCKET

    def upload(
        self,
        key: str,
        fileobj: BinaryIO,
        *,
        content_type: str,
        content_length: int | None = None,
    ) -> None:
        _, _, ClientError, BotoCoreError = _import_boto()
        extra: dict[str, Any] = {"ContentType": content_type}
        try:
            _get_client().upload_fileobj(
                fileobj,
                self._bucket,
                key,
                ExtraArgs=extra,
            )
            logger.info("Uploaded object to Wasabi bucket=%s key=%s", self._bucket, key)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in {"NoSuchBucket", "404"}:
                raise StorageError("Storage bucket not found", code="STORAGE_BUCKET_MISSING") from exc
            if code in {"AccessDenied", "403"}:
                raise StorageError("Storage access denied", code="STORAGE_ACCESS_DENIED") from exc
            raise StorageError("Failed to upload file", code="STORAGE_UPLOAD_FAILED") from exc
        except BotoCoreError as exc:
            raise StorageError("Storage network error", code="STORAGE_NETWORK_ERROR") from exc

    def delete(self, key: str) -> None:
        _, _, ClientError, BotoCoreError = _import_boto()
        try:
            _get_client().delete_object(Bucket=self._bucket, Key=key)
            logger.info("Deleted Wasabi object bucket=%s key=%s", self._bucket, key)
        except ClientError as exc:
            raise StorageError("Failed to delete file", code="STORAGE_DELETE_FAILED") from exc
        except BotoCoreError as exc:
            raise StorageError("Storage network error", code="STORAGE_NETWORK_ERROR") from exc

    def exists(self, key: str) -> bool:
        _, _, ClientError, BotoCoreError = _import_boto()
        try:
            _get_client().head_object(Bucket=self._bucket, Key=key)
            return True
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in {"404", "NoSuchKey", "NotFound"}:
                return False
            raise StorageError("Failed to check object", code="STORAGE_HEAD_FAILED") from exc
        except BotoCoreError as exc:
            raise StorageError("Storage network error", code="STORAGE_NETWORK_ERROR") from exc

    def download_bytes(self, key: str) -> tuple[bytes, str | None]:
        _, _, ClientError, BotoCoreError = _import_boto()
        try:
            response = _get_client().get_object(Bucket=self._bucket, Key=key)
            body = response["Body"].read()
            return body, response.get("ContentType")
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in {"404", "NoSuchKey", "NotFound"}:
                raise StorageNotFoundError() from exc
            raise StorageError("Failed to download file", code="STORAGE_DOWNLOAD_FAILED") from exc
        except BotoCoreError as exc:
            raise StorageError("Storage network error", code="STORAGE_NETWORK_ERROR") from exc

    def get_metadata(self, key: str) -> dict[str, Any]:
        _, _, ClientError, BotoCoreError = _import_boto()
        try:
            response = _get_client().head_object(Bucket=self._bucket, Key=key)
            return {
                "key": key,
                "size": response.get("ContentLength"),
                "content_type": response.get("ContentType"),
                "etag": response.get("ETag"),
                "last_modified": response.get("LastModified"),
            }
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in {"404", "NoSuchKey", "NotFound"}:
                raise StorageNotFoundError() from exc
            raise StorageError("Failed to read object metadata", code="STORAGE_HEAD_FAILED") from exc
        except BotoCoreError as exc:
            raise StorageError("Storage network error", code="STORAGE_NETWORK_ERROR") from exc

    def generate_presigned_download_url(self, key: str, *, expires_in: int = 3600) -> str:
        _, _, ClientError, BotoCoreError = _import_boto()
        try:
            return _get_client().generate_presigned_url(
                "get_object",
                Params={"Bucket": self._bucket, "Key": key},
                ExpiresIn=expires_in,
            )
        except (ClientError, BotoCoreError) as exc:
            raise StorageError("Failed to generate download URL", code="STORAGE_PRESIGN_FAILED") from exc

    def generate_presigned_upload_url(
        self,
        key: str,
        *,
        content_type: str,
        expires_in: int = 3600,
    ) -> dict[str, Any]:
        _, _, ClientError, BotoCoreError = _import_boto()
        try:
            url = _get_client().generate_presigned_url(
                "put_object",
                Params={
                    "Bucket": self._bucket,
                    "Key": key,
                    "ContentType": content_type,
                },
                ExpiresIn=expires_in,
            )
            return {
                "method": "PUT",
                "url": url,
                "key": key,
                "headers": {"Content-Type": content_type},
                "expires_in": expires_in,
            }
        except (ClientError, BotoCoreError) as exc:
            raise StorageError("Failed to generate upload URL", code="STORAGE_PRESIGN_FAILED") from exc

    def copy(self, source_key: str, dest_key: str) -> None:
        _, _, ClientError, BotoCoreError = _import_boto()
        try:
            _get_client().copy_object(
                Bucket=self._bucket,
                Key=dest_key,
                CopySource={"Bucket": self._bucket, "Key": source_key},
            )
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in {"404", "NoSuchKey", "NotFound"}:
                raise StorageNotFoundError() from exc
            raise StorageError("Failed to copy object", code="STORAGE_COPY_FAILED") from exc
        except BotoCoreError as exc:
            raise StorageError("Storage network error", code="STORAGE_NETWORK_ERROR") from exc

    def move(self, source_key: str, dest_key: str) -> None:
        self.copy(source_key, dest_key)
        self.delete(source_key)


def validate_wasabi_connection() -> None:
    """Fail fast at startup — verify bucket access."""
    _, _, ClientError, BotoCoreError = _import_boto()
    client = _get_client()
    try:
        client.head_bucket(Bucket=settings.WASABI_BUCKET)
        logger.info("Wasabi bucket verified bucket=%s", settings.WASABI_BUCKET)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        raise StorageError(
            f"Wasabi bucket check failed ({code})",
            code="STORAGE_BUCKET_MISSING",
        ) from exc
    except BotoCoreError as exc:
        raise StorageError("Wasabi connection failed", code="STORAGE_NETWORK_ERROR") from exc
