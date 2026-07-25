"""Storage layer tests."""

from __future__ import annotations

import uuid
from io import BytesIO
from unittest.mock import MagicMock, patch

import pytest

from app.config import settings
from app.services.storage.errors import StoragePermissionError, StorageValidationError
from app.services.storage.keys import assert_tenant_key, build_object_key, is_storage_object_key
from app.services.storage.local import LocalStorageBackend
from app.services.storage.service import TenantStorageService


@pytest.fixture
def school_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def local_backend(tmp_path):
    return LocalStorageBackend(str(tmp_path))


@pytest.fixture
def tenant_storage(local_backend):
    return TenantStorageService(local_backend)


def test_build_object_key_uses_school_uuid(school_id):
    key = build_object_key(school_id, "logo", "file.jpg")
    assert key == f"schools/{school_id}/logo/file.jpg"
    assert is_storage_object_key(key)


def test_assert_tenant_key_rejects_other_school(school_id):
    other = uuid.uuid4()
    key = build_object_key(other, "logo", "file.jpg")
    with pytest.raises(StoragePermissionError):
        assert_tenant_key(school_id, key)


def test_assert_tenant_key_rejects_path_traversal(school_id):
    with pytest.raises(StorageValidationError):
        assert_tenant_key(school_id, f"schools/{school_id}/../secret")


@pytest.mark.asyncio
async def test_upload_and_delete(tenant_storage, local_backend, school_id):
    data = b"fake-image-bytes"
    key = await tenant_storage.upload_bytes(
        school_id,
        "logo",
        data,
        "image/png",
        "test.png",
    )
    assert key.startswith(f"schools/{school_id}/logo/")
    assert local_backend.exists(key)
    await tenant_storage.delete(school_id, key)
    assert not local_backend.exists(key)


@pytest.mark.asyncio
async def test_presigned_download_local_returns_uploads_path(tenant_storage, school_id):
    key = await tenant_storage.upload_bytes(
        school_id,
        "stamp",
        b"stamp",
        "image/jpeg",
        "stamp.jpg",
    )
    url = await tenant_storage.presigned_download_url(school_id, key)
    assert url == f"/uploads/{key}"


@pytest.mark.asyncio
async def test_download_bytes_round_trip(tenant_storage, school_id):
    payload = b"photo-bytes"
    key = await tenant_storage.upload_bytes(
        school_id,
        "students",
        payload,
        "image/png",
        "profile.png",
    )
    data, content_type = await tenant_storage.download_bytes(school_id, key)
    assert data == payload
    assert content_type in {None, "image/png"}


@pytest.mark.asyncio
async def test_upload_rejects_invalid_mime(tenant_storage, school_id):
    with pytest.raises(StorageValidationError):
        await tenant_storage.upload_bytes(
            school_id,
            "logo",
            b"data",
            "application/pdf",
            "file.pdf",
        )


@pytest.mark.asyncio
async def test_upload_rejects_oversized_file(tenant_storage, school_id, monkeypatch):
    monkeypatch.setattr(
        TenantStorageService,
        "_max_bytes",
        staticmethod(lambda: 1024),
    )
    oversized = b"x" * 1025
    with pytest.raises(StorageValidationError):
        await tenant_storage.upload_bytes(
            school_id,
            "logo",
            oversized,
            "image/png",
            "big.png",
        )


def test_validate_storage_config_requires_wasabi_fields(monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_BACKEND", "wasabi")
    monkeypatch.setattr(settings, "WASABI_ACCESS_KEY", "")
    monkeypatch.setattr(settings, "WASABI_SECRET_KEY", "")
    monkeypatch.setattr(settings, "WASABI_BUCKET", "")
    monkeypatch.setattr(settings, "WASABI_REGION", "")
    monkeypatch.setattr(settings, "WASABI_ENDPOINT_URL", "")
    monkeypatch.setattr(settings, "WASABI_ENDPOINT", "")
    with pytest.raises(ValueError, match="WASABI_ACCESS_KEY"):
        settings.validate_storage_config()


@pytest.mark.asyncio
async def test_initialize_tenant_prefix_creates_category_markers(tenant_storage, local_backend, school_id):
    from app.services.storage.keys import SCHOOL_STORAGE_CATEGORIES

    keys = await tenant_storage.initialize_tenant_prefix(school_id)
    assert len(keys) == len(SCHOOL_STORAGE_CATEGORIES) + 1
    assert f"schools/{school_id}/.keep" in keys
    for category in SCHOOL_STORAGE_CATEGORIES:
        marker = f"schools/{school_id}/{category}/.keep"
        assert marker in keys
        assert local_backend.exists(marker)


@pytest.mark.asyncio
async def test_wasabi_upload_uses_boto3(school_id):
    pytest.importorskip("boto3")
    from app.services.storage.wasabi import WasabiStorageBackend

    backend = WasabiStorageBackend(bucket="makyschool")
    mock_client = MagicMock()
    with patch("app.services.storage.wasabi._get_client", return_value=mock_client):
        backend.upload(
            f"schools/{school_id}/logo/x.jpg",
            BytesIO(b"abc"),
            content_type="image/jpeg",
            content_length=3,
        )
    mock_client.upload_fileobj.assert_called_once()
