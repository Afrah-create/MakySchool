"""File type and size validation for teaching plans and subject resources."""

from __future__ import annotations

from pathlib import Path

from app.config import settings

ALLOWED_PLAN_TYPES = frozenset(
    {
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
)
ALLOWED_PLAN_EXTENSIONS = frozenset({".pdf", ".doc", ".docx"})

ALLOWED_RESOURCE_TYPES = frozenset(
    {
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "video/mp4",
        "video/quicktime",
        "video/x-msvideo",
        "video/x-matroska",
    }
)
ALLOWED_RESOURCE_EXTENSIONS = frozenset(
    {".pdf", ".doc", ".docx", ".ppt", ".pptx", ".mp4", ".mov", ".avi", ".mkv"}
)

VIDEO_MIME_TYPES = frozenset(
    {
        "video/mp4",
        "video/quicktime",
        "video/x-msvideo",
        "video/x-matroska",
    }
)

PDF_MIME = "application/pdf"
DOCUMENT_MIMES = frozenset(
    {
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }
)

_MIME_TO_EXT = {
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-powerpoint": ".ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/x-msvideo": ".avi",
    "video/x-matroska": ".mkv",
}


def normalize_mime(content_type: str) -> str:
    return (content_type or "").lower().split(";")[0].strip()


def file_extension(filename: str) -> str:
    return Path(filename or "").suffix.lower()


def extension_for_mime(mime: str, filename: str = "") -> str:
    ext = _MIME_TO_EXT.get(normalize_mime(mime))
    if ext:
        return ext
    from_name = file_extension(filename)
    return from_name if from_name else ".bin"


def infer_resource_type(mime: str) -> str:
    normalized = normalize_mime(mime)
    if normalized == PDF_MIME:
        return "pdf"
    if normalized in VIDEO_MIME_TYPES:
        return "video"
    if normalized in DOCUMENT_MIMES:
        return "document"
    return "other"


def max_plan_bytes() -> int:
    return settings.MAX_TEACHING_PLAN_SIZE_MB * 1024 * 1024


def max_resource_bytes(mime: str) -> int:
    if normalize_mime(mime) in VIDEO_MIME_TYPES:
        return settings.MAX_RESOURCE_VIDEO_SIZE_MB * 1024 * 1024
    return settings.MAX_RESOURCE_DOC_SIZE_MB * 1024 * 1024


def validate_teaching_plan_file(
    *,
    filename: str,
    file_type: str,
    file_size: int,
) -> str | None:
    """Return an error message if invalid, else None."""
    mime = normalize_mime(file_type)
    ext = file_extension(filename)
    if mime not in ALLOWED_PLAN_TYPES:
        return "Teaching plans must be PDF, DOC, or DOCX."
    if ext not in ALLOWED_PLAN_EXTENSIONS:
        return "Teaching plans must use a .pdf, .doc, or .docx extension."
    if file_size <= 0:
        return "File size must be greater than zero."
    limit = max_plan_bytes()
    if file_size > limit:
        return f"Teaching plan exceeds the {settings.MAX_TEACHING_PLAN_SIZE_MB}MB limit."
    return None


def validate_subject_resource_file(
    *,
    filename: str,
    file_type: str,
    file_size: int,
) -> str | None:
    """Return an error message if invalid, else None."""
    mime = normalize_mime(file_type)
    ext = file_extension(filename)
    if mime not in ALLOWED_RESOURCE_TYPES:
        return "This file type is not allowed. Use PDF, Word, PowerPoint, or common video formats."
    if ext not in ALLOWED_RESOURCE_EXTENSIONS:
        return "File extension is not allowed."
    if file_size <= 0:
        return "File size must be greater than zero."
    limit = max_resource_bytes(mime)
    limit_mb = (
        settings.MAX_RESOURCE_VIDEO_SIZE_MB
        if mime in VIDEO_MIME_TYPES
        else settings.MAX_RESOURCE_DOC_SIZE_MB
    )
    if file_size > limit:
        return f"File exceeds the {limit_mb}MB limit for this resource type."
    return None
