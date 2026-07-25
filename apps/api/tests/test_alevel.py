"""Unit tests for A-Level grading logic (app.lib.alevel)."""

from app.lib.alevel import (
    compute_grade,
    compute_result_code,
    compute_student_totals,
)


class TestComputePrincipalGrade:
    def test_band_boundaries(self):
        assert compute_grade(100, "principal") == ("A", 6)
        assert compute_grade(80, "principal") == ("A", 6)
        assert compute_grade(79, "principal") == ("B", 5)
        assert compute_grade(70, "principal") == ("B", 5)
        assert compute_grade(69, "principal") == ("C", 4)
        assert compute_grade(60, "principal") == ("C", 4)
        assert compute_grade(59, "principal") == ("D", 3)
        assert compute_grade(50, "principal") == ("D", 3)
        assert compute_grade(49, "principal") == ("E", 2)
        assert compute_grade(40, "principal") == ("E", 2)
        assert compute_grade(39, "principal") == ("O", 1)
        assert compute_grade(35, "principal") == ("O", 1)
        assert compute_grade(34, "principal") == ("F", 0)
        assert compute_grade(0, "principal") == ("F", 0)

    def test_out_of_range_is_clamped(self):
        assert compute_grade(150, "principal") == ("A", 6)
        assert compute_grade(-10, "principal") == ("F", 0)


class TestComputeSubsidiaryGrade:
    def test_pass_fail_threshold(self):
        assert compute_grade(35, "subsidiary") == ("P", 1)
        assert compute_grade(100, "subsidiary") == ("P", 1)
        assert compute_grade(34, "subsidiary") == ("F", 0)
        assert compute_grade(0, "subsidiary") == ("F", 0)


class TestResultCode:
    def test_codes(self):
        assert compute_result_code(3) == "1"
        assert compute_result_code(2) == "1"
        assert compute_result_code(1) == "2"
        assert compute_result_code(0) == "6"


class TestStudentTotals:
    def _grades(self):
        return [
            {"subject_type": "principal", "grade": "A", "points": 6, "is_gp": False},
            {"subject_type": "principal", "grade": "B", "points": 5, "is_gp": False},
            {"subject_type": "principal", "grade": "C", "points": 4, "is_gp": False},
            {"subject_type": "subsidiary", "grade": "P", "points": 1, "is_gp": True},
            {"subject_type": "subsidiary", "grade": "P", "points": 1, "is_gp": False},
        ]

    def test_full_certificate(self):
        totals = compute_student_totals(self._grades())
        assert totals["best_principal_points"] == 15
        assert totals["gp_points"] == 1
        assert totals["subsidiary_points"] == 1
        assert totals["total_points"] == 17
        assert totals["principal_pass_count"] == 3
        assert totals["result_code"] == "1"

    def test_best_three_principals_only(self):
        grades = self._grades()
        grades.append(
            {"subject_type": "principal", "grade": "A", "points": 6, "is_gp": False}
        )
        totals = compute_student_totals(grades)
        # Best 3 principals: 6 + 6 + 5 = 17
        assert totals["best_principal_points"] == 17
        assert totals["principal_pass_count"] == 3

    def test_camel_case_keys(self):
        grades = [
            {"subjectType": "principal", "grade": "A", "points": 6, "isGp": False},
            {"subjectType": "principal", "grade": "B", "points": 5, "isGp": False},
            {"subjectType": "principal", "grade": "C", "points": 4, "isGp": False},
            {"subjectType": "subsidiary", "grade": "P", "points": 1, "isGp": True},
            {"subjectType": "subsidiary", "grade": "P", "points": 1, "isGp": False},
        ]
        totals = compute_student_totals(grades)
        assert totals["total_points"] == 17
        assert totals["result_code"] == "1"

    def test_one_principal_pass_is_partial(self):
        grades = [
            {"subject_type": "principal", "grade": "E", "points": 2, "is_gp": False},
            {"subject_type": "principal", "grade": "O", "points": 1, "is_gp": False},
            {"subject_type": "principal", "grade": "F", "points": 0, "is_gp": False},
            {"subject_type": "subsidiary", "grade": "P", "points": 1, "is_gp": True},
            {"subject_type": "subsidiary", "grade": "F", "points": 0, "is_gp": False},
        ]
        totals = compute_student_totals(grades)
        assert totals["principal_pass_count"] == 1
        assert totals["result_code"] == "2"

    def test_no_passes_is_incomplete(self):
        grades = [
            {"subject_type": "principal", "grade": "O", "points": 1, "is_gp": False},
            {"subject_type": "principal", "grade": "F", "points": 0, "is_gp": False},
            {"subject_type": "principal", "grade": "F", "points": 0, "is_gp": False},
        ]
        totals = compute_student_totals(grades)
        assert totals["principal_pass_count"] == 0
        assert totals["result_code"] == "6"

    def test_gp_points_capped(self):
        grades = [
            {"subject_type": "subsidiary", "grade": "P", "points": 1, "is_gp": True},
        ]
        totals = compute_student_totals(grades)
        assert totals["gp_points"] == 1
        assert totals["subsidiary_points"] == 0
