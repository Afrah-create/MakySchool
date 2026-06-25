from typing import Literal

MakySchoolRole = Literal["admin", "head_teacher", "teacher", "bursar", "learner"]

CAN: dict[str, list[str]] = {
    "manageSchool": ["admin"],
    "manageBilling": ["admin"],
    "manageUsers": ["admin"],
    "manageStaff": ["admin", "head_teacher"],
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
    "manageAccounts": ["admin"],
    "viewAccounts": ["admin"],
    "manageIncomeSources": ["admin", "bursar"],
    "manageOtherIncome": ["admin", "bursar"],
    "voidIncome": ["admin"],
    "manageInvoices": ["admin", "bursar"],
    "viewInvoices": ["admin", "head_teacher", "bursar"],
    "manageBudget": ["admin"],
    "viewBudget": ["admin", "head_teacher"],
    "manageTimetable": ["admin", "head_teacher"],
    "viewTimetable": ["admin", "head_teacher", "teacher"],
    "viewAnalytics": ["admin", "head_teacher"],
}


def can(role: str, action: str) -> bool:
    normalized = role.lower()
    if normalized == "student":
        normalized = "learner"
    return normalized in CAN.get(action, [])
