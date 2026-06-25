from __future__ import annotations

from datetime import time


class TimetableValidationError(Exception):
    def __init__(self, message: str, code: str, fields: dict[str, str] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.fields = fields or {}


def times_overlap(start_a: time, end_a: time, start_b: time, end_b: time) -> bool:
    return start_a < end_b and end_a > start_b
