"""Traditional UACE A-Level grading logic.

Pure functions only — no DB access. Imported by app.routers.alevel.

Grounding facts (confirmed UNEB rules — do not deviate):
  Principal grades: A=6, B=5, C=4, D=3, E=2 (all principal passes), O=1, F=0.
  Subsidiary subjects (GP, Sub-Maths, ICT): pass/fail only — pass = 1 point, fail = 0.
  Max points: 3 principals x 6 = 18, + GP (1) + subsidiary (1) = 20.
  Result codes: 1 = certificate (>= 2 principal passes), 2 = partial (1 pass),
                6 = absent/incomplete (0 passes).

The system receives a single term mark (0-100) per subject and computes the
letter grade from the configurable bands below.
"""

from __future__ import annotations

from typing import Any

# Principal score bands: (min_score_inclusive, grade, points).
# Ordered high to low. Adjust here without touching logic.
PRINCIPAL_BANDS: list[tuple[float, str, int]] = [
    (80.0, "A", 6),
    (70.0, "B", 5),
    (60.0, "C", 4),
    (50.0, "D", 3),
    (40.0, "E", 2),
    (35.0, "O", 1),
    (0.0, "F", 0),
]

# Subsidiary subjects are pass/fail: score >= threshold => pass (1 point).
SUBSIDIARY_PASS_THRESHOLD = 35.0

# Principal grades that count as a principal pass (A-E).
PRINCIPAL_PASS_GRADES = frozenset({"A", "B", "C", "D", "E"})

RESULT_CODE_CERTIFICATE = "1"
RESULT_CODE_PARTIAL = "2"
RESULT_CODE_INCOMPLETE = "6"


def compute_grade(
    score: float,
    subject_type: str,
    bands: list[tuple[float, str, int]] | None = None,
    subsidiary_threshold: float | None = None,
) -> tuple[str, int]:
    """Return (grade_letter, points) for a raw score (0-100) and subject type.

    Principal subjects map to A-F bands; subsidiary subjects map to P/F.
    `bands` and `subsidiary_threshold` allow per-school overrides; both fall
    back to the UNEB defaults when omitted.
    """
    value = max(0.0, min(100.0, float(score)))

    if subject_type == "subsidiary":
        threshold = (
            SUBSIDIARY_PASS_THRESHOLD
            if subsidiary_threshold is None
            else float(subsidiary_threshold)
        )
        if value >= threshold:
            return "P", 1
        return "F", 0

    active_bands = bands if bands else PRINCIPAL_BANDS
    for minimum, grade, points in sorted(active_bands, key=lambda b: b[0], reverse=True):
        if value >= float(minimum):
            return grade, int(points)
    return "F", 0


def compute_result_code(principal_pass_count: int) -> str:
    """1 if >=2 principal passes, 2 if exactly 1, 6 if none."""
    if principal_pass_count >= 2:
        return RESULT_CODE_CERTIFICATE
    if principal_pass_count == 1:
        return RESULT_CODE_PARTIAL
    return RESULT_CODE_INCOMPLETE


def compute_student_totals(grades: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate a student's subject grades into UACE totals.

    Each grade dict contains: subject_type, grade, points, is_gp.
    Uses the best 3 principal subjects and the two subsidiaries (GP + one other).
    """
    principals = [g for g in grades if g.get("subject_type") == "principal"]
    subsidiaries = [g for g in grades if g.get("subject_type") == "subsidiary"]

    top_principals = sorted(
        principals, key=lambda g: int(g.get("points") or 0), reverse=True
    )[:3]
    best_principal_points = sum(int(g.get("points") or 0) for g in top_principals)
    principal_pass_count = sum(
        1 for g in top_principals if (g.get("grade") or "") in PRINCIPAL_PASS_GRADES
    )

    gp_points = sum(
        int(g.get("points") or 0) for g in subsidiaries if g.get("is_gp")
    )
    gp_points = min(gp_points, 1)

    non_gp_subsidiaries = [g for g in subsidiaries if not g.get("is_gp")]
    subsidiary_points = min(
        sum(int(g.get("points") or 0) for g in non_gp_subsidiaries[:1]), 1
    )

    total_points = best_principal_points + gp_points + subsidiary_points

    return {
        "best_principal_points": best_principal_points,
        "gp_points": gp_points,
        "subsidiary_points": subsidiary_points,
        "total_points": total_points,
        "principal_pass_count": principal_pass_count,
        "result_code": compute_result_code(principal_pass_count),
    }
