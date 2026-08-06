"""Typed notification event helpers. Domain routers call these — never notify() directly."""

from __future__ import annotations

import uuid
from typing import Any

import asyncpg

from app.lib.notifications import notify, notify_roles, notify_user
from app.lib.user_sql import USER_DISPLAY_NAME_SQL

# ---------------------------------------------------------------------------
# Event type constants
# ---------------------------------------------------------------------------

TEACHER_SUBMITTED_ALEVEL_MARKS = "teacher.submitted.alevel_marks"
TEACHER_SUBMITTED_OLEVEL_MARKS = "teacher.submitted.olevel_marks"
TEACHER_SUBMITTED_PRIMARY_MARKS = "teacher.submitted.primary_marks"
ADMIN_OPENED_EXAM_SESSION = "admin.opened.exam_session"
ADMIN_UNLOCKED_MARKS = "admin.unlocked.marks"
TEACHER_SUBMITTED_ATTENDANCE = "teacher.submitted.attendance"
TEACHER_UPLOADED_TEACHING_PLAN = "teacher.uploaded.teaching_plan"
TEACHER_PUBLISHED_RESOURCE = "teacher.published.resource"
ADMIN_CREATED_INVOICE = "admin.created.invoice"
ADMIN_RECORDED_PAYMENT = "admin.recorded.payment"
ADMIN_WAIVED_FEE = "admin.waived.fee"
ADMIN_GENERATED_REPORT_CARD = "admin.generated.report_card"

ADMIN_HEAD_ROLES = ["admin", "head_teacher"]

ALL_NOTIFICATION_TYPES = [
    TEACHER_SUBMITTED_ALEVEL_MARKS,
    TEACHER_SUBMITTED_OLEVEL_MARKS,
    TEACHER_SUBMITTED_PRIMARY_MARKS,
    ADMIN_OPENED_EXAM_SESSION,
    ADMIN_UNLOCKED_MARKS,
    TEACHER_SUBMITTED_ATTENDANCE,
    TEACHER_UPLOADED_TEACHING_PLAN,
    TEACHER_PUBLISHED_RESOURCE,
    ADMIN_CREATED_INVOICE,
    ADMIN_RECORDED_PAYMENT,
    ADMIN_WAIVED_FEE,
    ADMIN_GENERATED_REPORT_CARD,
]


async def _display_name(
    conn: asyncpg.Connection, user_id: uuid.UUID | None
) -> str:
    if not user_id:
        return "Someone"
    name = await conn.fetchval(
        f"SELECT {USER_DISPLAY_NAME_SQL} FROM users u WHERE u.id = $1",
        user_id,
    )
    return (name or "Someone").strip() or "Someone"


async def _teachers_for_class(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    class_id: uuid.UUID,
) -> list[uuid.UUID]:
    rows = await conn.fetch(
        """
        SELECT DISTINCT teacher_id
        FROM teacher_class_assignments
        WHERE school_id = $1
          AND class_id = $2
          AND subject_id IS NOT NULL
        """,
        school_id,
        class_id,
    )
    return [row["teacher_id"] for row in rows]


async def _learner_user_ids_for_class(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    class_id: uuid.UUID,
) -> list[uuid.UUID]:
    rows = await conn.fetch(
        """
        SELECT DISTINCT s.user_id
        FROM student_class_history sch
        JOIN students s ON s.id = sch.student_id AND s.school_id = sch.school_id
        WHERE sch.school_id = $1
          AND sch.class_id = $2
          AND sch.left_at IS NULL
          AND s.user_id IS NOT NULL
          AND s.status = 'active'
        """,
        school_id,
        class_id,
    )
    return [row["user_id"] for row in rows]


async def _learner_user_id_for_student(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    student_id: uuid.UUID,
) -> uuid.UUID | None:
    return await conn.fetchval(
        """
        SELECT user_id
        FROM students
        WHERE school_id = $1 AND id = $2 AND user_id IS NOT NULL
        """,
        school_id,
        student_id,
    )


# ---------------------------------------------------------------------------
# Mark submission
# ---------------------------------------------------------------------------


async def notify_alevel_marks_submitted(
    conn: asyncpg.Connection,
    *,
    actor_id: uuid.UUID,
    school_id: uuid.UUID,
    teacher_name: str | None = None,
    subject_name: str,
    class_name: str,
    exam_session_id: uuid.UUID,
    curriculum: str = "alevel",
) -> int:
    name = teacher_name or await _display_name(conn, actor_id)
    return await notify_roles(
        conn,
        TEACHER_SUBMITTED_ALEVEL_MARKS,
        actor_id,
        school_id,
        ADMIN_HEAD_ROLES,
        title=f"{name} submitted A-Level marks",
        body=(
            f"{subject_name} marks for {class_name} have been submitted "
            "and are ready for review."
        ),
        resource_type="exam_session",
        resource_id=exam_session_id,
        metadata={
            "teacher_name": name,
            "subject_name": subject_name,
            "class_name": class_name,
            "exam_session_id": str(exam_session_id),
            "curriculum": curriculum,
        },
    )


async def notify_olevel_marks_submitted(
    conn: asyncpg.Connection,
    *,
    actor_id: uuid.UUID,
    school_id: uuid.UUID,
    teacher_name: str | None = None,
    subject_name: str,
    class_name: str,
    exam_session_id: uuid.UUID,
) -> int:
    name = teacher_name or await _display_name(conn, actor_id)
    return await notify_roles(
        conn,
        TEACHER_SUBMITTED_OLEVEL_MARKS,
        actor_id,
        school_id,
        ADMIN_HEAD_ROLES,
        title=f"{name} submitted O-Level marks",
        body=(
            f"{subject_name} marks for {class_name} have been submitted "
            "and are ready for review."
        ),
        resource_type="exam_session",
        resource_id=exam_session_id,
        metadata={
            "teacher_name": name,
            "subject_name": subject_name,
            "class_name": class_name,
            "exam_session_id": str(exam_session_id),
            "curriculum": "olevel",
        },
    )


async def notify_primary_marks_submitted(
    conn: asyncpg.Connection,
    *,
    actor_id: uuid.UUID,
    school_id: uuid.UUID,
    teacher_name: str | None = None,
    subject_name: str,
    class_name: str,
    exam_session_id: uuid.UUID | None = None,
) -> int:
    name = teacher_name or await _display_name(conn, actor_id)
    return await notify_roles(
        conn,
        TEACHER_SUBMITTED_PRIMARY_MARKS,
        actor_id,
        school_id,
        ADMIN_HEAD_ROLES,
        title=f"{name} submitted primary marks",
        body=(
            f"{subject_name} marks for {class_name} have been submitted "
            "and are ready for review."
        ),
        resource_type="exam_session" if exam_session_id else None,
        resource_id=exam_session_id,
        metadata={
            "teacher_name": name,
            "subject_name": subject_name,
            "class_name": class_name,
            "exam_session_id": str(exam_session_id) if exam_session_id else None,
            "curriculum": "primary",
        },
    )


async def notify_exam_session_opened(
    conn: asyncpg.Connection,
    *,
    actor_id: uuid.UUID,
    school_id: uuid.UUID,
    class_id: uuid.UUID,
    session_id: uuid.UUID,
    session_title: str,
    class_name: str,
    term_name: str,
    category_name: str | None = None,
    max_marks: int | float | None = None,
    term_end_date: str | None = None,
    curriculum: str = "olevel",
) -> int:
    teachers = await _teachers_for_class(conn, school_id, class_id)
    if not teachers:
        return 0
    deadline = term_end_date or "the term ends"
    body = (
        f"{session_title} is now open. Please enter and submit your marks "
        f"before {deadline}."
    )
    return await notify(
        conn,
        ADMIN_OPENED_EXAM_SESSION,
        actor_id,
        school_id,
        teachers,
        title="Exam session opened for mark entry",
        body=body,
        resource_type="exam_session",
        resource_id=session_id,
        metadata={
            "session_title": session_title,
            "class_name": class_name,
            "term_name": term_name,
            "category_name": category_name,
            "max_marks": max_marks,
            "curriculum": curriculum,
        },
    )


async def notify_marks_unlocked(
    conn: asyncpg.Connection,
    *,
    actor_id: uuid.UUID,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
    subject_name: str,
    class_name: str,
    reason: str = "Unlocked by admin",
    exam_session_id: uuid.UUID | None = None,
    curriculum: str | None = None,
) -> int:
    return await notify_user(
        conn,
        ADMIN_UNLOCKED_MARKS,
        actor_id,
        school_id,
        teacher_id,
        title="Your marks have been unlocked",
        body=(
            f"Your {subject_name} marks for {class_name} have been unlocked "
            f"for correction. Reason: {reason}."
        ),
        resource_type="exam_session" if exam_session_id else None,
        resource_id=exam_session_id,
        metadata={
            "subject_name": subject_name,
            "class_name": class_name,
            "reason": reason,
            "curriculum": curriculum,
        },
    )


# ---------------------------------------------------------------------------
# Attendance
# ---------------------------------------------------------------------------


async def notify_attendance_submitted(
    conn: asyncpg.Connection,
    *,
    actor_id: uuid.UUID,
    school_id: uuid.UUID,
    teacher_name: str | None = None,
    class_name: str,
    subject_name: str,
    period_number: int | str,
    date: str,
    student_count: int,
    timetable_period_id: uuid.UUID,
) -> int:
    name = teacher_name or await _display_name(conn, actor_id)
    return await notify_roles(
        conn,
        TEACHER_SUBMITTED_ATTENDANCE,
        actor_id,
        school_id,
        ADMIN_HEAD_ROLES,
        title=f"{name} submitted attendance",
        body=(
            f"Attendance for {class_name} — {subject_name}, Period {period_number} "
            f"on {date} has been submitted."
        ),
        resource_type="attendance_period",
        resource_id=timetable_period_id,
        metadata={
            "teacher_name": name,
            "class_name": class_name,
            "subject_name": subject_name,
            "period_number": period_number,
            "date": date,
            "student_count": student_count,
        },
    )


# ---------------------------------------------------------------------------
# Teaching plans & resources
# ---------------------------------------------------------------------------


async def notify_teaching_plan_uploaded(
    conn: asyncpg.Connection,
    *,
    actor_id: uuid.UUID,
    school_id: uuid.UUID,
    teacher_name: str | None = None,
    subject_name: str,
    class_name: str,
    term_name: str,
    file_name: str,
    plan_id: uuid.UUID,
) -> int:
    name = teacher_name or await _display_name(conn, actor_id)
    return await notify_roles(
        conn,
        TEACHER_UPLOADED_TEACHING_PLAN,
        actor_id,
        school_id,
        ADMIN_HEAD_ROLES,
        title=f"{name} uploaded a teaching plan",
        body=(
            f"A teaching plan for {subject_name} — {class_name}, {term_name} "
            "has been uploaded."
        ),
        resource_type="teaching_plan",
        resource_id=plan_id,
        metadata={
            "teacher_name": name,
            "subject_name": subject_name,
            "class_name": class_name,
            "term_name": term_name,
            "file_name": file_name,
        },
    )


async def notify_resource_published(
    conn: asyncpg.Connection,
    *,
    actor_id: uuid.UUID,
    school_id: uuid.UUID,
    class_id: uuid.UUID,
    teacher_name: str | None = None,
    resource_title: str,
    subject_name: str,
    resource_type_label: str | None = None,
    class_name: str,
    resource_id: uuid.UUID,
) -> int:
    name = teacher_name or await _display_name(conn, actor_id)
    learners = await _learner_user_ids_for_class(conn, school_id, class_id)
    if not learners:
        return 0
    return await notify(
        conn,
        TEACHER_PUBLISHED_RESOURCE,
        actor_id,
        school_id,
        learners,
        title="New resource available",
        body=(
            f"{name} has shared a new resource: {resource_title} for {subject_name}."
        ),
        resource_type="subject_resource",
        resource_id=resource_id,
        metadata={
            "teacher_name": name,
            "resource_title": resource_title,
            "subject_name": subject_name,
            "resource_type": resource_type_label,
            "class_name": class_name,
        },
    )


# ---------------------------------------------------------------------------
# Fees
# ---------------------------------------------------------------------------


async def notify_invoices_created(
    conn: asyncpg.Connection,
    *,
    actor_id: uuid.UUID,
    school_id: uuid.UUID,
    invoices: list[dict[str, Any]],
    term_name: str,
    academic_year: int | str,
    due_date: str | None = None,
) -> int:
    """Create one notification per invoice for students with portal accounts."""
    if not invoices:
        return 0

    student_ids = [inv["student_id"] for inv in invoices]
    rows = await conn.fetch(
        """
        SELECT id, user_id
        FROM students
        WHERE school_id = $1
          AND id = ANY($2::uuid[])
          AND user_id IS NOT NULL
        """,
        school_id,
        student_ids,
    )
    user_by_student = {row["id"]: row["user_id"] for row in rows}

    total = 0
    for inv in invoices:
        user_id = user_by_student.get(inv["student_id"])
        if not user_id:
            continue
        amount = int(inv.get("total_amount") or inv.get("amount") or 0)
        invoice_id = inv["id"]
        invoice_number = inv.get("invoice_number") or ""
        total += await notify_user(
            conn,
            ADMIN_CREATED_INVOICE,
            actor_id,
            school_id,
            user_id,
            title="New fee invoice",
            body=(
                f"An invoice of UGX {amount:,} has been created for "
                f"{term_name} {academic_year}. Please ensure payment is made "
                "before the deadline."
            ),
            resource_type="invoice",
            resource_id=invoice_id if isinstance(invoice_id, uuid.UUID) else uuid.UUID(str(invoice_id)),
            metadata={
                "amount_ugx": amount,
                "term_name": term_name,
                "academic_year": academic_year,
                "due_date": due_date,
                "invoice_number": invoice_number,
            },
        )
    return total


async def notify_payment_recorded(
    conn: asyncpg.Connection,
    *,
    actor_id: uuid.UUID,
    school_id: uuid.UUID,
    student_id: uuid.UUID,
    amount_ugx: int,
    balance_ugx: int,
    payment_method: str | None,
    receipt_number: str | None,
    payment_id: uuid.UUID,
) -> int:
    user_id = await _learner_user_id_for_student(conn, school_id, student_id)
    if not user_id:
        return 0
    return await notify_user(
        conn,
        ADMIN_RECORDED_PAYMENT,
        actor_id,
        school_id,
        user_id,
        title="Payment received",
        body=(
            f"A payment of UGX {amount_ugx:,} has been recorded on your account. "
            f"Your current balance is UGX {balance_ugx:,}."
        ),
        resource_type="fee_payment",
        resource_id=payment_id,
        metadata={
            "amount_ugx": amount_ugx,
            "balance_ugx": balance_ugx,
            "payment_method": payment_method,
            "receipt_number": receipt_number,
        },
    )


async def notify_fee_waived(
    conn: asyncpg.Connection,
    *,
    actor_id: uuid.UUID,
    school_id: uuid.UUID,
    student_id: uuid.UUID,
    amount_ugx: int,
    reason: str | None = None,
) -> int:
    user_id = await _learner_user_id_for_student(conn, school_id, student_id)
    if not user_id:
        return 0
    return await notify_user(
        conn,
        ADMIN_WAIVED_FEE,
        actor_id,
        school_id,
        user_id,
        title="Fee waived",
        body=f"UGX {amount_ugx:,} has been waived on your account by the school.",
        metadata={
            "amount_ugx": amount_ugx,
            "reason": reason,
        },
    )


# ---------------------------------------------------------------------------
# Report cards
# ---------------------------------------------------------------------------


async def notify_report_card_ready(
    conn: asyncpg.Connection,
    *,
    actor_id: uuid.UUID,
    school_id: uuid.UUID,
    student_ids: list[uuid.UUID],
    term_name: str,
    academic_year: str | int | None = None,
    enrollment_ids: dict[uuid.UUID, uuid.UUID] | None = None,
) -> int:
    if not student_ids:
        return 0
    rows = await conn.fetch(
        """
        SELECT id, user_id
        FROM students
        WHERE school_id = $1
          AND id = ANY($2::uuid[])
          AND user_id IS NOT NULL
        """,
        school_id,
        student_ids,
    )
    total = 0
    year_label = academic_year if academic_year is not None else ""
    body = (
        f"Your {term_name} report card has been generated and is available for download."
    )
    for row in rows:
        student_id = row["id"]
        resource_id = None
        if enrollment_ids and student_id in enrollment_ids:
            resource_id = enrollment_ids[student_id]
        else:
            resource_id = student_id
        total += await notify_user(
            conn,
            ADMIN_GENERATED_REPORT_CARD,
            actor_id,
            school_id,
            row["user_id"],
            title="Your report card is ready",
            body=body,
            resource_type="report_card",
            resource_id=resource_id,
            metadata={
                "term_name": term_name,
                "academic_year": year_label,
                "student_id": str(student_id),
            },
        )
    return total
