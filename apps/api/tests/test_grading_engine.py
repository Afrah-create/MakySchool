"""Unit tests for the curriculum-agnostic grading engine."""

from app.lib.grading_engine import (
    calculate_weighted_score,
    check_promotion,
    grade_from_weighted_score,
    run_grading_pipeline_data,
    select_counting_subjects,
)

NLSC_SCALE = [
    {"grade": "A", "label": "Exceptional", "points": 5, "min_percent": 80, "max_percent": 100, "is_pass": True},
    {"grade": "B", "label": "Outstanding", "points": 4, "min_percent": 65, "max_percent": 79, "is_pass": True},
    {"grade": "C", "label": "Satisfactory", "points": 3, "min_percent": 50, "max_percent": 64, "is_pass": True},
    {"grade": "D", "label": "Basic", "points": 2, "min_percent": 40, "max_percent": 49, "is_pass": True},
    {"grade": "E", "label": "Elementary", "points": 1, "min_percent": 0, "max_percent": 39, "is_pass": True},
]

CATEGORIES = [
    {"code": "CA", "weight_percent": 20},
    {"code": "EXAM", "weight_percent": 80},
]


class TestWeightedScore:
    def test_ca_20_exam_80(self):
        # CA=80%, EXAM=75% → 0.2*80 + 0.8*75 = 76.0
        assert calculate_weighted_score({"CA": 80, "EXAM": 75}, CATEGORIES) == 76.0


class TestGradeBoundaries:
    def test_exact_boundaries(self):
        assert grade_from_weighted_score(80.0, NLSC_SCALE)["grade"] == "A"
        assert grade_from_weighted_score(79.9, NLSC_SCALE)["grade"] == "B"
        assert grade_from_weighted_score(65.0, NLSC_SCALE)["grade"] == "B"
        assert grade_from_weighted_score(64.9, NLSC_SCALE)["grade"] == "C"
        assert grade_from_weighted_score(50.0, NLSC_SCALE)["grade"] == "C"
        assert grade_from_weighted_score(40.0, NLSC_SCALE)["grade"] == "D"
        assert grade_from_weighted_score(39.9, NLSC_SCALE)["grade"] == "E"


class TestSelectCountingSubjects:
    def test_weakest_optional_excluded(self):
        subjects = [
            {"subject_id": "1", "subject_role": "compulsory", "points": 4, "weighted_score": 70},
            {"subject_id": "2", "subject_role": "optional", "points": 5, "weighted_score": 90},
            {"subject_id": "3", "subject_role": "optional", "points": 3, "weighted_score": 55},
            {"subject_id": "4", "subject_role": "optional", "points": 4, "weighted_score": 72},
        ]
        result = select_counting_subjects(
            subjects,
            {"optional_to_count_in_result": 2},
        )
        by_id = {s["subject_id"]: s for s in result}
        assert by_id["1"]["counts_in_result"] is True
        assert by_id["2"]["counts_in_result"] is True
        assert by_id["4"]["counts_in_result"] is True
        assert by_id["3"]["counts_in_result"] is False  # weakest optional


class TestPromotion:
    def test_failed_one_compulsory_when_max_zero(self):
        promoted, reason = check_promotion(
            {
                "compulsory_failed": 1,
                "compulsory_passed": 6,
                "optional_failed": 0,
                "optional_passed": 2,
            },
            {"min_grade_to_pass": "D", "max_failed_compulsory": 0, "max_failed_optional": 2},
        )
        assert promoted is False
        assert "compulsory" in reason.lower()


class TestPipeline:
    def test_end_to_end_preview(self):
        enrollment = {
            "enrollment_id": "e1",
            "student_id": "s1",
            "subjects": [
                {
                    "subject_id": "eng",
                    "subject_role": "compulsory",
                    "category_scores_raw": {"CA": 32, "EXAM": 75},
                    "max_marks_by_category": {"CA": 40, "EXAM": 100},
                },
                {
                    "subject_id": "opt1",
                    "subject_role": "optional",
                    "category_scores_raw": {"CA": 40, "EXAM": 90},
                    "max_marks_by_category": {"CA": 40, "EXAM": 100},
                },
                {
                    "subject_id": "opt2",
                    "subject_role": "optional",
                    "category_scores_raw": {"CA": 10, "EXAM": 30},
                    "max_marks_by_category": {"CA": 40, "EXAM": 100},
                },
            ],
        }
        rules = {
            "assessment_categories": CATEGORIES,
            "grade_scale": NLSC_SCALE,
            "selection_rules": {"optional_to_count_in_result": 1},
            "promotion_rules": {
                "min_grade_to_pass": "D",
                "max_failed_compulsory": 0,
                "max_failed_optional": 2,
            },
        }
        out = run_grading_pipeline_data(enrollment, rules)
        by_id = {s["subject_id"]: s for s in out["subjects"]}
        # CA 80% + EXAM 75% → 76 → grade B
        assert by_id["eng"]["weighted_score"] == 76.0
        assert by_id["eng"]["grade"] == "B"
        assert by_id["opt1"]["counts_in_result"] is True
        assert by_id["opt2"]["counts_in_result"] is False
        assert out["totals"]["subjects_counted"] == 2
