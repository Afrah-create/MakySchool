"""Unit tests for A-Level grading logic and report helpers."""

from app.lib.alevel import (
    compute_grade,
    compute_result_code,
    compute_student_totals,
)
from app.lib.alevel_pdf import build_alevel_report_html
from app.lib.alevel_reports import student_initials


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


class TestReportHelpers:
    def test_student_initials(self):
        assert student_initials("Jane Doe") == "JD"
        assert student_initials("Madonna") == "MA"
        assert student_initials("") == "?"
        assert student_initials("  Ada   Lovelace  ") == "AL"

    def test_report_html_uses_initials_without_photo(self):
        html = build_alevel_report_html(
            {
                "schoolName": "Demo High",
                "logoUrl": None,
                "stampUrl": None,
                "studentName": "Jane Doe",
                "studentInitials": "JD",
                "photoUrl": None,
                "learnerId": "L-001",
                "className": "S5 East",
                "combinationName": "PCM",
                "examName": "Mid Term",
                "examTypeName": "MID",
                "termName": "Term 2",
                "subjects": [
                    {
                        "code": "P",
                        "subjectName": "Physics",
                        "rawScore": 80,
                        "grade": "A",
                        "points": 6,
                        "descriptor": "Distinction",
                    }
                ],
                "total_points": 17,
                "principal_pass_count": 3,
                "result_code": "1",
                "position": 2,
                "classSize": 40,
                "classTeacherComment": "Good work",
                "headTeacherComment": "Keep it up",
                "approvedAt": "2026-07-26T10:00:00+00:00",
                "approvedByName": "Head Teacher",
            }
        )
        assert "avatar-initials" in html
        assert "JD" in html
        assert "Jane Doe" in html
        assert "Certificate Eligible" in html
        assert "<script" not in html.lower()

    def test_report_html_embeds_photo_when_present(self):
        html = build_alevel_report_html(
            {
                "schoolName": "Demo High",
                "studentName": "Jane Doe",
                "studentInitials": "JD",
                "photoUrl": "data:image/png;base64,abc",
                "subjects": [],
                "total_points": 0,
                "principal_pass_count": 0,
                "result_code": "6",
            }
        )
        assert 'class="avatar-img"' in html
        assert "data:image/png;base64,abc" in html
        assert 'class="avatar-initials"' not in html
