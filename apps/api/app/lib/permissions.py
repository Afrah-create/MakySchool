from typing import Literal

MakySchoolRole = Literal["admin", "head_teacher", "teacher", "bursar", "learner"]

CAN: dict[str, list[str]] = {
    "manageSchool": ["admin"],
    "manageBilling": ["admin"],
    "manageUsers": ["admin"],
    "viewAllClasses": ["admin", "head_teacher"],
    "viewAllStaff": ["admin", "head_teacher"],
    "viewAllResults": ["admin", "head_teacher"],
    "manageClasses": ["admin", "head_teacher"],
    "enterMarks": ["admin", "head_teacher", "teacher"],
    "viewOwnClasses": ["admin", "head_teacher", "teacher"],
    "viewFinance": ["admin"],
    "viewFees": ["admin", "head_teacher", "bursar"],
    "manageFees": ["admin", "bursar"],
    "recordPayments": ["bursar"],
    "voidPayments": ["admin"],
    "waiveFees": ["admin"],
    "viewReports": ["admin", "head_teacher", "bursar"],
}


def can(role: str, action: str) -> bool:
    normalized = role.lower()
    if normalized == "student":
        normalized = "learner"
    return normalized in CAN.get(action, [])
