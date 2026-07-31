"""School contact phone/email list helpers."""

from __future__ import annotations

import json
from typing import Any


def normalize_contact_list(values: Any) -> list[str]:
    """Trim, drop empties, dedupe (order preserved)."""
    if values is None:
        return []
    if isinstance(values, str):
        raw = values.strip()
        if not raw:
            return []
        if raw.startswith("["):
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                return [raw]
            return normalize_contact_list(parsed)
        return [raw]
    if not isinstance(values, (list, tuple)):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in values:
        text = str(item).strip() if item is not None else ""
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(text)
    return out


def contacts_from_form(
    *,
    list_raw: str | None,
    single: str | None,
) -> list[str] | None:
    """
    Parse Form contact fields.

    Returns None when neither list nor single was provided (leave DB unchanged).
    """
    if list_raw is not None:
        return normalize_contact_list(list_raw)
    if single is not None:
        return normalize_contact_list(single)
    return None


def primary_contact(values: list[str] | None) -> str | None:
    if not values:
        return None
    return values[0]
