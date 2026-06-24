import json
import uuid
from typing import Any

from fastapi import HTTPException, status


def parse_pg_json(value: Any, *, default: Any | None = None) -> Any:
    """Decode JSON values returned as strings from asyncpg aggregate queries."""
    if value is None:
        return default if default is not None else []
    if isinstance(value, (list, dict)):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return default if default is not None else []
        return json.loads(stripped)
    return value


def parse_uuid_string_list(value: Any) -> list[str]:
    parsed = parse_pg_json(value, default=[])
    if not isinstance(parsed, list):
        return []
    return [str(item).strip() for item in parsed if item is not None and str(item).strip()]


def parse_uuid_list(class_ids: list[str], *, error_code: str = "INVALID_CLASS") -> list[uuid.UUID]:
    parsed: list[uuid.UUID] = []
    for raw in class_ids:
        try:
            parsed.append(uuid.UUID(str(raw).strip()))
        except (ValueError, AttributeError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "One or more class IDs are invalid.",
                    "code": error_code,
                },
            )
    return list(dict.fromkeys(parsed))
