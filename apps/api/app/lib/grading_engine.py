"""Pure curriculum-agnostic grading calculations.

Every rule is passed in as parameters — this module never hardcodes grade
letters, weights, subject roles, or curriculum names.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any


def _d(value: Any) -> Decimal:
    if value is None:
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _round2(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def calculate_percentage(raw_score: Any, max_marks: Any) -> float:
    """Convert a raw score to a percentage. Absent/None → 0.0. Zero max → 0.0."""
    if raw_score is None:
        return 0.0
    max_d = _d(max_marks)
    if max_d <= 0:
        return 0.0
    return _round2((_d(raw_score) / max_d) * Decimal("100"))


def calculate_category_percentages(
    category_scores_raw: dict[str, Any],
    max_marks_by_category: dict[str, Any],
) -> dict[str, float]:
    result: dict[str, float] = {}
    for code, raw in category_scores_raw.items():
        result[code] = calculate_percentage(raw, max_marks_by_category.get(code, 0))
    return result


def calculate_weighted_score(
    category_percentages: dict[str, Any],
    assessment_categories: list[dict[str, Any]],
) -> float:
    """Weighted average of category percentages using each category's weight_percent."""
    total = Decimal("0")
    for cat in assessment_categories:
        code = cat["code"]
        weight = _d(cat["weight_percent"])
        pct = _d(category_percentages.get(code, 0))
        total += pct * (weight / Decimal("100"))
    return _round2(total)


def grade_from_weighted_score(
    weighted_score: float,
    grade_scale: list[dict[str, Any]],
) -> dict[str, Any]:
    """Return the matching grade band for a weighted score.

    Scale entries must include: grade, label, points, min_percent, max_percent, is_pass.
    """
    if not grade_scale:
        raise ValueError("grade_scale must not be empty")

    score = _d(weighted_score)
    ordered = sorted(grade_scale, key=lambda g: _d(g["min_percent"]), reverse=True)
    for band in ordered:
        if score >= _d(band["min_percent"]):
            return {
                "grade": band["grade"],
                "label": band.get("label"),
                "points": float(_d(band["points"])),
                "min_percent": float(_d(band["min_percent"])),
                "max_percent": float(_d(band["max_percent"])),
                "is_pass": bool(band.get("is_pass", True)),
            }

    lowest = min(grade_scale, key=lambda g: _d(g["min_percent"]))
    return {
        "grade": lowest["grade"],
        "label": lowest.get("label"),
        "points": float(_d(lowest["points"])),
        "min_percent": float(_d(lowest["min_percent"])),
        "max_percent": float(_d(lowest["max_percent"])),
        "is_pass": bool(lowest.get("is_pass", True)),
    }


def select_counting_subjects(
    subject_results: list[dict[str, Any]],
    selection_rules: dict[str, Any],
) -> list[dict[str, Any]]:
    """Mark which subjects count toward the final result using selection rules."""
    optional_to_count = int(selection_rules.get("optional_to_count_in_result", 0))
    compulsory = [dict(s) for s in subject_results if s.get("subject_role") == "compulsory"]
    optional = [dict(s) for s in subject_results if s.get("subject_role") == "optional"]
    other = [
        dict(s)
        for s in subject_results
        if s.get("subject_role") not in ("compulsory", "optional")
    ]

    for item in compulsory:
        item["counts_in_result"] = True

    optional_sorted = sorted(
        optional,
        key=lambda s: (_d(s.get("points", 0)), _d(s.get("weighted_score", 0))),
        reverse=True,
    )
    for idx, item in enumerate(optional_sorted):
        item["counts_in_result"] = idx < optional_to_count

    for item in other:
        item["counts_in_result"] = False

    # Preserve original order as much as possible by subject_id map
    by_id = {str(s.get("subject_id") or s.get("subjectId")): s for s in compulsory + optional_sorted + other}
    out: list[dict[str, Any]] = []
    for original in subject_results:
        key = str(original.get("subject_id") or original.get("subjectId"))
        out.append(by_id.get(key, {**original, "counts_in_result": False}))
    return out


def calculate_totals(counting_subjects: list[dict[str, Any]]) -> dict[str, Any]:
    counted = [s for s in counting_subjects if s.get("counts_in_result")]
    total_points = sum((_d(s.get("points", 0)) for s in counted), Decimal("0"))
    avg = (
        sum((_d(s.get("weighted_score", 0)) for s in counted), Decimal("0")) / Decimal(len(counted))
        if counted
        else Decimal("0")
    )

    def _is_pass(s: dict[str, Any]) -> bool:
        return bool(s.get("is_pass", True))

    compulsory = [s for s in counted if s.get("subject_role") == "compulsory"]
    optional = [s for s in counted if s.get("subject_role") == "optional"]

    return {
        "total_points": _round2(total_points),
        "average_percent": _round2(avg),
        "compulsory_passed": sum(1 for s in compulsory if _is_pass(s)),
        "compulsory_failed": sum(1 for s in compulsory if not _is_pass(s)),
        "optional_passed": sum(1 for s in optional if _is_pass(s)),
        "optional_failed": sum(1 for s in optional if not _is_pass(s)),
        "subjects_counted": len(counted),
    }


def check_promotion(
    student_totals: dict[str, Any],
    promotion_rules: dict[str, Any],
) -> tuple[bool, str]:
    """Apply promotion rules to totals. Pass threshold is rule-driven via failed counts."""
    max_failed_comp = int(promotion_rules.get("max_failed_compulsory", 0))
    max_failed_opt = int(promotion_rules.get("max_failed_optional", 0))
    failed_comp = int(student_totals.get("compulsory_failed", 0))
    failed_opt = int(student_totals.get("optional_failed", 0))
    min_grade = promotion_rules.get("min_grade_to_pass", "")

    if failed_comp > max_failed_comp:
        return (
            False,
            f"Failed {failed_comp} compulsory subject(s); maximum allowed is {max_failed_comp}"
            + (f" (pass grade {min_grade})" if min_grade else ""),
        )
    if failed_opt > max_failed_opt:
        return (
            False,
            f"Failed {failed_opt} optional subject(s); maximum allowed is {max_failed_opt}",
        )
    return True, "Meets promotion criteria"


def _pass_for_grade(grade: str, grade_scale: list[dict[str, Any]], min_grade_to_pass: str) -> bool:
    """Determine pass using points ordering relative to min_grade_to_pass."""
    points_by_grade = {str(g["grade"]): _d(g["points"]) for g in grade_scale}
    min_points = points_by_grade.get(str(min_grade_to_pass))
    grade_points = points_by_grade.get(str(grade))
    if min_points is None or grade_points is None:
        # Fall back to band is_pass if ordering unknown
        for g in grade_scale:
            if str(g["grade"]) == str(grade):
                return bool(g.get("is_pass", True))
        return True
    return grade_points >= min_points


def run_grading_pipeline_data(enrollment_data: dict[str, Any], rules: dict[str, Any]) -> dict[str, Any]:
    """Top-level pure pipeline. No I/O.

    enrollment_data keys:
      enrollment_id, student_id, class_level
      subjects: list of {
        subject_id, subject_role, subject_name?, subject_code?,
        category_scores_raw: {code: raw_or_null},
        max_marks_by_category: {code: max},
      }

    rules keys:
      assessment_categories, grade_scale, selection_rules, promotion_rules
    """
    categories = list(rules.get("assessment_categories") or [])
    grade_scale = list(rules.get("grade_scale") or [])
    selection_rules = dict(rules.get("selection_rules") or {})
    promotion_rules = dict(rules.get("promotion_rules") or {})
    min_grade = str(promotion_rules.get("min_grade_to_pass") or "")

    subject_results: list[dict[str, Any]] = []
    for subj in enrollment_data.get("subjects") or []:
        raw = dict(subj.get("category_scores_raw") or {})
        max_by = dict(subj.get("max_marks_by_category") or {})
        cat_pct = calculate_category_percentages(raw, max_by)
        weighted = calculate_weighted_score(cat_pct, categories)
        band = grade_from_weighted_score(weighted, grade_scale)
        is_pass = _pass_for_grade(band["grade"], grade_scale, min_grade) if min_grade else bool(band["is_pass"])
        subject_results.append(
            {
                "subject_id": subj.get("subject_id"),
                "subject_role": subj.get("subject_role"),
                "subject_name": subj.get("subject_name"),
                "subject_code": subj.get("subject_code"),
                "category_scores": cat_pct,
                "weighted_score": weighted,
                "grade": band["grade"],
                "points": band["points"],
                "is_pass": is_pass,
                "label": band.get("label"),
            }
        )

    counting = select_counting_subjects(subject_results, selection_rules)
    totals = calculate_totals(counting)
    promoted, reason = check_promotion(totals, promotion_rules)

    return {
        "enrollment_id": enrollment_data.get("enrollment_id"),
        "student_id": enrollment_data.get("student_id"),
        "subjects": counting,
        "totals": totals,
        "is_promoted": promoted,
        "promotion_reason": reason,
    }
