from __future__ import annotations

import re
import uuid
from typing import Iterable

from app.services.storage.errors import StoragePermissionError, StorageValidationError

_KEY_SEGMENT = re.compile(r"^[a-zA-Z0-9._-]+$")
_FORBIDDEN_KEY_PARTS = frozenset({".", ".."})

# Prefix folders provisioned when a superadmin creates a school.
SCHOOL_STORAGE_CATEGORIES = (
    "logo",
    "stamp",
    "students",
    "teachers",
    "staff",
    "report_cards",
    "exams",
    "assignments",
    "documents",
    "invoices",
    "library",
    "teaching-plans",
    "resources",
)


def build_object_key(school_id: uuid.UUID, category: str, *parts: str) -> str:
    """Build a tenant-scoped object key under schools/{school_id}/."""
    category_clean = _sanitize_segment(category, field="category")
    segments = [f"schools/{school_id}", category_clean]
    for part in parts:
        if not part:
            continue
        segments.append(_sanitize_segment(part, field="path segment"))
    return "/".join(segments)


def _sanitize_segment(value: str, *, field: str) -> str:
    trimmed = value.strip().strip("/")
    if not trimmed or trimmed in _FORBIDDEN_KEY_PARTS:
        raise StorageValidationError(f"Invalid storage {field}")
    if ".." in trimmed or "\\" in trimmed:
        raise StorageValidationError(f"Invalid storage {field}")
    if not _KEY_SEGMENT.match(trimmed):
        raise StorageValidationError(f"Invalid storage {field}")
    return trimmed


def assert_tenant_key(school_id: uuid.UUID, key: str) -> str:
    """Ensure key belongs to the authenticated school; return normalized key."""
    normalized = key.strip().lstrip("/")
    if not normalized:
        raise StorageValidationError("Object key is required")
    if ".." in normalized or normalized.startswith("/") or "\\" in normalized:
        raise StorageValidationError("Invalid object key")
    expected_prefix = f"schools/{school_id}/"
    if not normalized.startswith(expected_prefix):
        raise StoragePermissionError("Object key does not belong to this school")
    return normalized


def is_storage_object_key(value: str | None) -> bool:
    if not value:
        return False
    return value.startswith("schools/") and not value.startswith("/")


def is_legacy_upload_path(value: str | None) -> bool:
    if not value:
        return False
    return value.startswith("/uploads/")


def legacy_path_to_key(value: str) -> str | None:
    """Convert /uploads/schools/{id}/... to schools/{id}/... if possible."""
    if not is_legacy_upload_path(value):
        return None
    trimmed = value[len("/uploads/") :]
    if trimmed.startswith("schools/"):
        return trimmed
    return None
