"""Camel-case serializers shared by O-Level services."""
from __future__ import annotations

from typing import Any


def _value(value: Any) -> Any:
    if value is None:
        return None
    if hasattr(value, "isoformat") and not isinstance(value, str):
        try:
            return value.isoformat()
        except Exception:
            pass
    # asyncpg uses Decimal for numeric columns; UUID for ids.
    name = value.__class__.__name__
    if name == "Decimal":
        return float(value)
    if name == "UUID":
        return str(value)
    if isinstance(value, list):
        return [_value(v) for v in value]
    return value


def row(row: Any, fields: dict[str, str] | None = None) -> dict[str, Any]:
    data = dict(row)
    return {
        (fields.get(key, key) if fields else key): _value(value)
        for key, value in data.items()
    }


def grade_scale(row_: Any) -> dict[str, Any]:
    return row(row_, {"curriculum_id": "curriculumId", "min_percent": "minPercent",
                      "max_percent": "maxPercent", "is_pass": "isPass",
                      "display_order": "displayOrder"})


def category(row_: Any) -> dict[str, Any]:
    return row(row_, {"curriculum_id": "curriculumId", "weight_percent": "weightPercent",
                      "display_order": "displayOrder", "is_active": "isActive"})


def selection_rule(row_: Any) -> dict[str, Any]:
    return row(row_, {"curriculum_id": "curriculumId", "applies_to_levels": "appliesToLevels",
                      "min_subjects": "minSubjects", "max_subjects": "maxSubjects",
                      "compulsory_count": "compulsoryCount", "optional_min": "optionalMin",
                      "optional_max": "optionalMax",
                      "optional_to_count_in_result": "optionalToCountInResult"})


def curriculum(row_: Any, *, grade_scale_: list[Any] | None = None,
               categories: list[Any] | None = None, selection_rules_: list[Any] | None = None,
               promotion_rules: Any | None = None, report_rules: Any | None = None) -> dict[str, Any]:
    result = row(row_, {"school_id": "schoolId", "education_level": "educationLevel",
                        "academic_year_from": "academicYearFrom", "academic_year_to": "academicYearTo",
                        "is_active": "isActive", "created_by": "createdBy"})
    if grade_scale_ is not None:
        result["gradeScale"] = [grade_scale(x) for x in grade_scale_]
    if categories is not None:
        result["assessmentCategories"] = [category(x) for x in categories]
    if selection_rules_ is not None:
        result["selectionRules"] = [selection_rule(x) for x in selection_rules_]
    if promotion_rules is not None:
        result["promotionRules"] = row(promotion_rules, {"curriculum_id": "curriculumId",
            "min_grade_to_pass": "minGradeToPass", "max_failed_compulsory": "maxFailedCompulsory",
            "max_failed_optional": "maxFailedOptional", "attendance_min_percent": "attendanceMinPercent"})
    if report_rules is not None:
        result["reportRules"] = row(report_rules, {"curriculum_id": "curriculumId",
            "show_grades": "showGrades", "show_percentages": "showPercentages",
            "show_points": "showPoints", "show_remarks": "showRemarks",
            "show_class_position": "showClassPosition", "show_subject_position": "showSubjectPosition",
            "show_division_ranking": "showDivisionRanking", "show_result_code": "showResultCode",
            "show_teacher_comment": "showTeacherComment",
            "show_head_teacher_comment": "showHeadTeacherComment",
            "show_attendance": "showAttendance", "report_title": "reportTitle",
            "custom_footer_text": "customFooterText"})
    return result


def subject(row_: Any) -> dict[str, Any]:
    return row(row_, {"school_id": "schoolId", "school_subject_id": "schoolSubjectId",
                      "is_active": "isActive"})


def curriculum_subject(row_: Any) -> dict[str, Any]:
    data = dict(row_)
    return {
        "id": str(data.get("id")),
        "curriculumId": str(data.get("curriculum_id")) if data.get("curriculum_id") else None,
        "subjectId": str(data["subject_id"]),
        "name": data.get("name"),
        "code": data.get("code"),
        "abbreviation": data.get("abbreviation"),
        "department": data.get("department"),
        "schoolSubjectId": str(data["school_subject_id"]) if data.get("school_subject_id") else None,
        "subjectRole": data["subject_role"],
        "appliesToLevels": list(data["applies_to_levels"] or []),
        "displayOrder": int(data.get("display_order") or 0),
        "isActive": bool(data.get("is_active", True)),
    }


def session(row_: Any) -> dict[str, Any]:
    data = dict(row_)
    level = data.get("level")
    stream = data.get("stream")
    class_name = data.get("class_name")
    if not class_name and level:
        class_name = f"{level}{stream or ''}".strip()
    result = row(
        row_,
        {
            "school_id": "schoolId",
            "curriculum_id": "curriculumId",
            "class_id": "classId",
            "term_id": "termId",
            "academic_year_id": "academicYearId",
            "category_id": "categoryId",
            "max_marks": "maxMarks",
            "created_by": "createdBy",
            "opened_at": "openedAt",
            "closed_at": "closedAt",
            "term_name": "termName",
            "category_name": "categoryName",
            "class_name": "className",
        },
    )
    if class_name:
        result["className"] = class_name
    if level:
        result["classLevel"] = level
    return result


def enrollment(row_: Any) -> dict[str, Any]:
    return row(row_, {"school_id": "schoolId", "student_id": "studentId",
                      "curriculum_id": "curriculumId", "class_id": "classId",
                      "academic_year_id": "academicYearId", "enrolled_by": "enrolledBy",
                      "student_name": "studentName", "learner_id": "learnerId", "class_name": "className",
                      "registered_subject_count": "registeredSubjectCount",
                      "optional_subject_count": "optionalSubjectCount",
                      "compulsory_subject_count": "compulsorySubjectCount"})


def mark(row_: Any) -> dict[str, Any]:
    return row(row_, {"student_id": "studentId", "student_name": "studentName",
                      "learner_id": "learnerId", "raw_score": "rawScore",
                      "is_absent": "isAbsent", "entered_at": "enteredAt"})


def subject_result(row_: Any) -> dict[str, Any]:
    return row(row_, {"school_id": "schoolId", "enrollment_id": "enrollmentId",
        "subject_id": "subjectId", "subject_role": "subjectRole", "academic_year_id": "academicYearId",
        "term_id": "termId", "category_scores": "categoryScores", "weighted_score": "weightedScore",
        "is_pass": "isPass", "counts_in_result": "countsInResult",
        "subject_position": "subjectPosition", "teacher_comment": "teacherComment",
        "subject_name": "subjectName", "subject_code": "subjectCode"})


def student_result(row_: Any) -> dict[str, Any]:
    return row(row_, {"school_id": "schoolId", "enrollment_id": "enrollmentId",
        "academic_year_id": "academicYearId", "term_id": "termId",
        "compulsory_passed": "compulsoryPassed", "compulsory_failed": "compulsoryFailed",
        "optional_passed": "optionalPassed", "optional_failed": "optionalFailed",
        "subjects_counted": "subjectsCounted", "total_points": "totalPoints",
        "average_percent": "averagePercent", "class_position": "classPosition",
        "total_students_in_class": "totalStudentsInClass", "is_promoted": "isPromoted",
        "promotion_reason": "promotionReason", "class_teacher_comment": "classTeacherComment",
        "head_teacher_comment": "headTeacherComment", "approved_by": "approvedBy",
        "approved_at": "approvedAt", "report_generated": "reportGenerated",
        "report_generated_at": "reportGeneratedAt",
        "student_name": "studentName", "learner_id": "learnerId"})
