"""Primary grading / PLE calculation utilities."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

DEFAULT_GRADE_SCALE = [
    {
        "grade": "D",
        "label": "Distinction",
        "min_percent": 80,
        "max_percent": 100,
        "remarks": "Excellent work! Keep it up.",
        "display_order": 1,
    },
    {
        "grade": "C",
        "label": "Credit",
        "min_percent": 60,
        "max_percent": 79,
        "remarks": "Good performance. Aim higher.",
        "display_order": 2,
    },
    {
        "grade": "P",
        "label": "Pass",
        "min_percent": 40,
        "max_percent": 59,
        "remarks": "Satisfactory. Work harder.",
        "display_order": 3,
    },
    {
        "grade": "F",
        "label": "Fail",
        "min_percent": 0,
        "max_percent": 39,
        "remarks": "Needs improvement. Seek help.",
        "display_order": 4,
    },
]

DEFAULT_SUBJECTS = [
    {
        "name": "Literacy (English)",
        "code": "LIT",
        "subject_type": "thematic",
        "applies_from": "P1",
        "applies_to": "P3",
        "is_ple_subject": False,
        "display_order": 1,
    },
    {
        "name": "Numeracy (Mathematics)",
        "code": "NUM",
        "subject_type": "thematic",
        "applies_from": "P1",
        "applies_to": "P3",
        "is_ple_subject": False,
        "display_order": 2,
    },
    {
        "name": "Religious Education",
        "code": "RE",
        "subject_type": "thematic",
        "applies_from": "P1",
        "applies_to": "P3",
        "is_ple_subject": False,
        "display_order": 3,
    },
    {
        "name": "English Language",
        "code": "ENG",
        "subject_type": "core",
        "applies_from": "P4",
        "applies_to": "P7",
        "is_ple_subject": True,
        "max_mark": 100,
        "display_order": 10,
    },
    {
        "name": "Mathematics",
        "code": "MATH",
        "subject_type": "core",
        "applies_from": "P4",
        "applies_to": "P7",
        "is_ple_subject": True,
        "max_mark": 100,
        "display_order": 11,
    },
    {
        "name": "Primary Integrated Science",
        "code": "PIS",
        "subject_type": "core",
        "applies_from": "P4",
        "applies_to": "P7",
        "is_ple_subject": True,
        "max_mark": 100,
        "display_order": 12,
    },
    {
        "name": "Social Studies",
        "code": "SST",
        "subject_type": "core",
        "applies_from": "P4",
        "applies_to": "P7",
        "is_ple_subject": True,
        "max_mark": 100,
        "display_order": 13,
    },
    {
        "name": "Religious Education",
        "code": "RE_UP",
        "subject_type": "core",
        "applies_from": "P4",
        "applies_to": "P7",
        "is_ple_subject": False,
        "max_mark": 100,
        "display_order": 14,
    },
    {
        "name": "Local Language",
        "code": "LOC",
        "subject_type": "core",
        "applies_from": "P4",
        "applies_to": "P7",
        "is_ple_subject": False,
        "max_mark": 100,
        "display_order": 15,
    },
    {
        "name": "Creative Arts & PE",
        "code": "CAPE",
        "subject_type": "core",
        "applies_from": "P4",
        "applies_to": "P7",
        "is_ple_subject": False,
        "max_mark": 100,
        "display_order": 16,
    },
]

# Practical default themes for lower primary (schools can edit).
DEFAULT_THEMES = [
    {"name": "Our School", "applies_from": "P1", "applies_to": "P3", "display_order": 1},
    {"name": "Our Home", "applies_from": "P1", "applies_to": "P3", "display_order": 2},
    {"name": "Our Community", "applies_from": "P1", "applies_to": "P3", "display_order": 3},
    {"name": "Our Country", "applies_from": "P1", "applies_to": "P3", "display_order": 4},
    {"name": "Our Earth and Beyond", "applies_from": "P1", "applies_to": "P3", "display_order": 5},
    {"name": "Health and Hygiene", "applies_from": "P1", "applies_to": "P3", "display_order": 6},
    {"name": "Food and Nutrition", "applies_from": "P1", "applies_to": "P3", "display_order": 7},
    {"name": "Human Body and Health", "applies_from": "P1", "applies_to": "P3", "display_order": 8},
    {"name": "Weather and Environment", "applies_from": "P1", "applies_to": "P3", "display_order": 9},
    {"name": "Transport", "applies_from": "P1", "applies_to": "P3", "display_order": 10},
    {"name": "Things We Make", "applies_from": "P1", "applies_to": "P3", "display_order": 11},
    {"name": "Peace and Security", "applies_from": "P1", "applies_to": "P3", "display_order": 12},
]

DEFAULT_STRANDS = (
    "Literacy",
    "Numeracy",
    "Religious Education",
    "Life Skills",
)

PLE_GRADE_POINTS = {
    "D1": 1,
    "D2": 2,
    "C3": 3,
    "C4": 4,
    "C5": 5,
    "C6": 6,
    "P7": 7,
    "P8": 8,
    "F9": 9,
}

# Common Uganda upper-primary / mock-PLE percent → D1–F9 bands.
DEFAULT_PLE_GRADE_SCALE = [
    {"grade": "D1", "label": "Distinction 1", "min_percent": 80, "max_percent": 100, "display_order": 1},
    {"grade": "D2", "label": "Distinction 2", "min_percent": 70, "max_percent": 79, "display_order": 2},
    {"grade": "C3", "label": "Credit 3", "min_percent": 65, "max_percent": 69, "display_order": 3},
    {"grade": "C4", "label": "Credit 4", "min_percent": 60, "max_percent": 64, "display_order": 4},
    {"grade": "C5", "label": "Credit 5", "min_percent": 55, "max_percent": 59, "display_order": 5},
    {"grade": "C6", "label": "Credit 6", "min_percent": 50, "max_percent": 54, "display_order": 6},
    {"grade": "P7", "label": "Pass 7", "min_percent": 45, "max_percent": 49, "display_order": 7},
    {"grade": "P8", "label": "Pass 8", "min_percent": 40, "max_percent": 44, "display_order": 8},
    {"grade": "F9", "label": "Fail 9", "min_percent": 0, "max_percent": 39, "display_order": 9},
]

AGGREGATE_MODES = frozenset({"ple_points", "percent"})

PLE_DIVISIONS = [
    {"division": "1", "min_agg": 4, "max_agg": 12, "label": "Division 1"},
    {"division": "2", "min_agg": 13, "max_agg": 23, "label": "Division 2"},
    {"division": "3", "min_agg": 24, "max_agg": 29, "label": "Division 3"},
    {"division": "4", "min_agg": 30, "max_agg": 34, "label": "Division 4"},
    {"division": "U", "min_agg": 35, "max_agg": 36, "label": "Ungraded"},
]

THEMATIC_LEVELS = {
    4: {"label": "Excellent", "short": "E", "description": "Exceeds expectations"},
    3: {"label": "Good", "short": "G", "description": "Meets expectations"},
    2: {"label": "Fair", "short": "F", "description": "Approaching expectations"},
    1: {"label": "Poor", "short": "P", "description": "Below expectations"},
}

BULK_MARKS_LIMIT = 500  # students per bulk request (large classes)


def _as_float(value: float | Decimal | int | None) -> float | None:
    if value is None:
        return None
    return float(value)


def round2(value: float) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def get_grade_from_percent(percent: float, scale: list[dict]) -> dict:
    ordered = sorted(scale, key=lambda x: float(x["min_percent"]), reverse=True)
    for grade in ordered:
        if percent >= float(grade["min_percent"]):
            return grade
    return ordered[-1] if ordered else {"grade": "F", "label": "Fail"}


def calculate_final_mark(
    ca_percentage: float | None,
    exam_percentage: float | None,
    ca_weight: float,
    exam_weight: float,
) -> float | None:
    if exam_percentage is None:
        return None
    if ca_percentage is None:
        return round2(exam_percentage)
    return round2((ca_percentage * ca_weight / 100) + (exam_percentage * exam_weight / 100))


def calculate_ple_division(aggregate: int) -> str:
    for div in PLE_DIVISIONS:
        if div["min_agg"] <= aggregate <= div["max_agg"]:
            return div["division"]
    if aggregate < 4:
        return "1"
    return "U"


def ple_points(grade: str) -> int:
    key = (grade or "").strip().upper()
    if key not in PLE_GRADE_POINTS:
        raise ValueError(f"Invalid PLE grade '{grade}'. Use D1–F9.")
    return PLE_GRADE_POINTS[key]


def ple_points_optional(grade: str | None) -> int | None:
    if not grade:
        return None
    key = grade.strip().upper()
    return PLE_GRADE_POINTS.get(key)


def get_ple_grade_from_percent(percent: float, scale: list[dict] | None = None) -> dict:
    """Map a percent to D1–F9 using the PLE band table (or a school override)."""
    active = scale if scale else DEFAULT_PLE_GRADE_SCALE
    # Prefer bands that look like PLE letters when a mixed scale is passed.
    ple_bands = [b for b in active if str(b.get("grade", "")).upper() in PLE_GRADE_POINTS]
    return get_grade_from_percent(percent, ple_bands or DEFAULT_PLE_GRADE_SCALE)


def scale_is_ple(scale: list[dict]) -> bool:
    grades = {str(b.get("grade", "")).upper() for b in scale}
    return bool(grades & set(PLE_GRADE_POINTS.keys()))


def validate_grade_scale(rows: list[dict]) -> str | None:
    if not rows:
        return "At least one grade band is required."
    ordered = sorted(rows, key=lambda r: float(r["min_percent"]))
    if float(ordered[0]["min_percent"]) > 0:
        return "Grade scale must start at 0%."
    if float(ordered[-1]["max_percent"]) < 100:
        return "Grade scale must cover up to 100%."
    for i, row in enumerate(ordered):
        lo = float(row["min_percent"])
        hi = float(row["max_percent"])
        if lo > hi:
            return f"Invalid range for grade {row.get('grade')}."
        if i > 0:
            prev_hi = float(ordered[i - 1]["max_percent"])
            if lo <= prev_hi:
                return "Grade scale ranges must not overlap."
            if lo > prev_hi + 1 and abs(lo - (prev_hi + 1)) > 0.01:
                # Allow contiguous or touching; gap of >1 is a hole
                if lo > prev_hi + 0.01:
                    return "Grade scale ranges must cover 0–100 without gaps."
    return None
