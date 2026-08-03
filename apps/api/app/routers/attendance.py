from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Any, Optional
from zoneinfo import ZoneInfo

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, field_validator

from app.db.pool import get_db
from app.middleware.subscription_guard import require_tenant_with_subscription
from app.services.makyreach import (
    MakyReachError,
    MakyReachNotConfigured,
    makyreach_configured,
    send_sms,
)

router = APIRouter()

EAT = ZoneInfo("Africa/Kampala")

TenantCtx = Annotated[
    tuple[uuid.UUID, dict[str, Any]],
    Depends(require_tenant_with_subscription),
]

ALLOWED_ROLES = {"teacher", "admin", "head_teacher"}
ADMIN_ROLES = {"admin", "head_teacher"}
DOSSIER_ROLES = ALLOWED_ROLES | {"learner", "student"}
NOTIFY_TYPES = frozenset({"period_absent", "day_absent", "manual"})


# ── Pydantic Models ────────────────────────────────────────────────────────────

class AttendanceEntry(BaseModel):
    student_id: uuid.UUID
    status: str
    notes: str | None = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in ("present", "absent", "late"):
            raise ValueError("status must be present, absent, or late")
        return v


class BulkAttendancePayload(BaseModel):
    timetable_period_id: uuid.UUID
    term_id: uuid.UUID
    date: str  # YYYY-MM-DD
    entries: list[AttendanceEntry]

    @field_validator("date")
    @classmethod
    def not_future(cls, v: str) -> str:
        today = datetime.now(tz=EAT).date().isoformat()
        if v > today:
            raise ValueError("Cannot record attendance for a future date")
        return v

    @field_validator("entries")
    @classmethod
    def entries_not_empty(cls, v: list) -> list:
        if not v:
            raise ValueError("entries must not be empty")
        if len(v) > 1000:
            raise ValueError("Too many entries (max 1000)")
        return v


class NotifyParentPayload(BaseModel):
    type: str  # period_absent | day_absent | manual
    date: str  # YYYY-MM-DD
    timetable_period_id: uuid.UUID | None = None
    message: str | None = None

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in NOTIFY_TYPES:
            raise ValueError("type must be period_absent, day_absent, or manual")
        return v

    @field_validator("date")
    @classmethod
    def not_future(cls, v: str) -> str:
        today = datetime.now(tz=EAT).date().isoformat()
        if v > today:
            raise ValueError("Cannot notify for a future date")
        return v


# ── Internal Security Verification Helpers ─────────────────────────────────────

def _require_allowed_role(actor: dict[str, Any], *, allow_learner: bool = False) -> None:
    allowed = DOSSIER_ROLES if allow_learner else ALLOWED_ROLES
    if actor["role"] not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "You do not have permission to access attendance.",
                "code": "FORBIDDEN",
            },
        )


def _require_admin_role(actor: dict[str, Any]) -> None:
    if actor["role"] not in ADMIN_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "Only admins and head teachers can view attendance analytics.",
                "code": "FORBIDDEN",
            },
        )


async def _assert_teacher_owns_period(
    conn: asyncpg.Connection,
    teacher_id: uuid.UUID,
    timetable_period_id: uuid.UUID,
    school_id: uuid.UUID,
) -> uuid.UUID:
    """
    Validates that the teacher is assigned to this timetable period.
    Returns the associated class_id for downstream roster matching.
    """
    row = await conn.fetchrow(
        """
        SELECT class_id FROM timetable_periods
        WHERE id = $1 AND teacher_id = $2 AND school_id = $3
        LIMIT 1
        """,
        timetable_period_id,
        teacher_id,
        school_id,
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "You are not assigned to this timetable period.",
                "code": "FORBIDDEN",
            },
        )
    return row["class_id"]


def _class_display_name(level: str, stream: str | None) -> str:
    return f"{level} {stream}".strip() if stream else level


def _actor_user_id(actor: dict[str, Any]) -> uuid.UUID:
    raw = actor.get("user_db_id") or actor["sub"]
    return uuid.UUID(str(raw))


def _risk_level(rate: float, consecutive_absent: int) -> str:
    if consecutive_absent >= 3 or rate < 70:
        return "critical"
    if rate < 80:
        return "at_risk"
    if rate < 90:
        return "watch"
    return "ok"


async def _assert_can_view_student(
    conn: asyncpg.Connection,
    actor: dict[str, Any],
    student_id: uuid.UUID,
    school_id: uuid.UUID,
) -> dict[str, Any]:
    """Return student row; teachers may only access students in their classes."""
    student = await conn.fetchrow(
        """
        SELECT
          s.id,
          s.full_name,
          s.learner_id,
          s.current_class_id,
          s.status,
          sc.level,
          sc.stream
        FROM students s
        LEFT JOIN school_classes sc ON sc.id = s.current_class_id
        WHERE s.id = $1 AND s.school_id = $2
        """,
        student_id,
        school_id,
    )
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "Student not found in this school.", "code": "NOT_FOUND"},
        )

    if actor["role"] in ADMIN_ROLES:
        return dict(student)

    actor_id = _actor_user_id(actor)

    if actor["role"] in ("learner", "student"):
        linked = await conn.fetchval(
            """
            SELECT 1 FROM students
            WHERE id = $1 AND school_id = $2 AND user_id = $3
            LIMIT 1
            """,
            student_id,
            school_id,
            actor_id,
        )
        if not linked:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "You do not have access to this student's attendance.",
                    "code": "FORBIDDEN",
                },
            )
        return dict(student)

    class_id = student["current_class_id"]
    if not class_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "You do not have access to this student's attendance.",
                "code": "FORBIDDEN",
            },
        )

    allowed = await conn.fetchval(
        """
        SELECT EXISTS(
          SELECT 1 FROM teacher_class_assignments tca
          WHERE tca.school_id = $1 AND tca.teacher_id = $2 AND tca.class_id = $3
        )
        OR EXISTS(
          SELECT 1 FROM timetable_periods tp
          WHERE tp.school_id = $1 AND tp.teacher_id = $2 AND tp.class_id = $3
        )
        """,
        school_id,
        actor_id,
        class_id,
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "You do not have access to this student's attendance.",
                "code": "FORBIDDEN",
            },
        )
    return dict(student)


# ── GET /schools/attendance/timetable ──────────────────────────────────────────

@router.get("/timetable")
async def get_teacher_timetable_slots(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    date: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
):
    school_id, actor = ctx
    _require_allowed_role(actor)

    actor_id = uuid.UUID(str(actor["sub"]))

    parsed_date = datetime.strptime(date, "%Y-%m-%d").date()
    day_of_week = parsed_date.isoweekday()

    periods = await conn.fetch(
        """
        SELECT
          tp.id            AS timetable_period_id,
          tp.class_id,
          sc.level,
          sc.stream,
          ss.name           AS subject_name,
          tp.period_number,
          tp.start_time::text AS start_time,
          tp.end_time::text   AS end_time,
          (
            SELECT COUNT(*)::int
            FROM students s
            WHERE s.current_class_id = tp.class_id
              AND s.status = 'active'
              AND s.school_id = tp.school_id
          ) AS student_count,
          EXISTS(
            SELECT 1 FROM attendance a
            WHERE a.timetable_period_id = tp.id
              AND a.date = $4
              AND a.school_id = tp.school_id
          ) AS already_submitted
        FROM timetable_periods tp
        JOIN school_classes sc  ON sc.id = tp.class_id
        JOIN school_subjects ss ON ss.id = tp.subject_id
        WHERE tp.teacher_id = $1
          AND tp.day_of_week = $2
          AND tp.school_id = $3
        ORDER BY tp.start_time ASC
        """,
        actor_id,
        day_of_week,
        school_id,
        parsed_date,
    )

    result = []
    for p in periods:
        start_lbl = p["start_time"][:5]
        end_lbl = p["end_time"][:5]

        result.append({
            "timetableSlotId": str(p["timetable_period_id"]),
            "classId": str(p["class_id"]),
            "className": _class_display_name(p["level"], p["stream"]),
            "subjectName": p["subject_name"],
            "periodNumber": p["period_number"],
            "startTime": start_lbl,
            "endTime": end_lbl,
            "timeLabel": f"Period {p['period_number']} ({start_lbl} - {end_lbl})",
            "studentCount": p["student_count"],
            "alreadySubmitted": p["already_submitted"],
        })

    return {"data": result}


# ── GET /schools/attendance/summary ───────────────────────────────────────────

@router.get("/summary")
async def get_attendance_summary(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    student_id: uuid.UUID = Query(...),
    term_id: uuid.UUID = Query(...),
):
    school_id, actor = ctx
    _require_allowed_role(actor)
    await _assert_can_view_student(conn, actor, student_id, school_id)

    row = await conn.fetchrow(
        """
        WITH student_class AS (
          SELECT s.id AS student_id, s.current_class_id AS class_id
          FROM students s
          WHERE s.id = $1 AND s.school_id = $2
        ),
        school_days AS (
          SELECT COUNT(DISTINCT a.date)::int AS total_school_days
          FROM attendance a
          JOIN student_class sc ON sc.class_id = a.class_id
          WHERE a.term_id = $3 AND a.school_id = $2
        ),
        attended_days AS (
          SELECT COUNT(DISTINCT a.date)::int AS days_attended
          FROM attendance a
          JOIN student_class sc ON sc.student_id = a.student_id
          WHERE a.term_id = $3
            AND a.school_id = $2
            AND a.status IN ('present', 'late')
        ),
        absent_days AS (
          SELECT COUNT(DISTINCT a.date)::int AS days_absent
          FROM attendance a
          JOIN student_class sc ON sc.student_id = a.student_id
          WHERE a.term_id = $3
            AND a.school_id = $2
            AND a.status = 'absent'
            AND NOT EXISTS (
              SELECT 1 FROM attendance a2
              WHERE a2.student_id = a.student_id
                AND a2.date = a.date
                AND a2.term_id = $3
                AND a2.school_id = $2
                AND a2.status IN ('present', 'late')
            )
        )
        SELECT
          $1::uuid AS student_id,
          $3::uuid AS term_id,
          COALESCE((SELECT days_attended FROM attended_days), 0) AS days_attended,
          COALESCE((SELECT total_school_days FROM school_days), 0) AS total_school_days,
          COALESCE((SELECT days_absent FROM absent_days), 0) AS days_absent
        """,
        student_id,
        school_id,
        term_id,
    )

    total = int(row["total_school_days"]) if row else 0
    attended = int(row["days_attended"]) if row else 0
    rate = round((attended / total) * 100, 1) if total > 0 else 0.0

    return {
        "data": {
            "studentId": str(row["student_id"]),
            "termId": str(row["term_id"]),
            "daysAttended": attended,
            "totalSchoolDays": total,
            "daysAbsent": int(row["days_absent"]) if row else 0,
            "attendanceRate": rate,
            "riskLevel": _risk_level(rate, 0),
        }
    }


# ── GET /schools/attendance/students/{student_id} ─────────────────────────────

@router.get("/students/{student_id}")
async def get_student_attendance_dossier(
    student_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    term_id: uuid.UUID = Query(...),
    date_from: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
):
    school_id, actor = ctx
    _require_allowed_role(actor, allow_learner=True)
    student = await _assert_can_view_student(conn, actor, student_id, school_id)

    # Default range: term bounds or last 90 days
    term_row = await conn.fetchrow(
        """
        SELECT id, name, start_date, end_date
        FROM terms
        WHERE id = $1 AND school_id = $2
        """,
        term_id,
        school_id,
    )
    if not term_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "Term not found.", "code": "NOT_FOUND"},
        )

    today = datetime.now(tz=EAT).date()
    parsed_to = (
        datetime.strptime(date_to, "%Y-%m-%d").date()
        if date_to
        else min(term_row["end_date"] or today, today)
    )
    parsed_from = (
        datetime.strptime(date_from, "%Y-%m-%d").date()
        if date_from
        else (term_row["start_date"] or today.replace(month=1, day=1))
    )
    # Future term starts (or inverted client ranges) should not 400 the dossier.
    if parsed_from > parsed_to:
        parsed_from = parsed_to

    class_id = student["current_class_id"]

    period_stats = await conn.fetchrow(
        """
        SELECT
          COUNT(*) FILTER (WHERE a.status = 'present')::int AS periods_present,
          COUNT(*) FILTER (WHERE a.status = 'late')::int AS periods_late,
          COUNT(*) FILTER (WHERE a.status = 'absent')::int AS periods_absent
        FROM attendance a
        WHERE a.school_id = $1
          AND a.student_id = $2
          AND a.term_id = $3
          AND a.date BETWEEN $4 AND $5
        """,
        school_id,
        student_id,
        term_id,
        parsed_from,
        parsed_to,
    )

    day_rows = await conn.fetch(
        """
        SELECT
          a.date,
          COUNT(*) FILTER (WHERE a.status = 'present')::int AS present_n,
          COUNT(*) FILTER (WHERE a.status = 'late')::int AS late_n,
          COUNT(*) FILTER (WHERE a.status = 'absent')::int AS absent_n
        FROM attendance a
        WHERE a.school_id = $1
          AND a.student_id = $2
          AND a.term_id = $3
          AND a.date BETWEEN $4 AND $5
        GROUP BY a.date
        ORDER BY a.date ASC
        """,
        school_id,
        student_id,
        term_id,
        parsed_from,
        parsed_to,
    )

    school_days = 0
    if class_id:
        school_days = await conn.fetchval(
            """
            SELECT COUNT(DISTINCT a.date)::int
            FROM attendance a
            WHERE a.school_id = $1
              AND a.class_id = $2
              AND a.term_id = $3
              AND a.date BETWEEN $4 AND $5
            """,
            school_id,
            class_id,
            term_id,
            parsed_from,
            parsed_to,
        ) or 0

    days_present = 0
    days_late = 0
    days_absent = 0
    calendar = []
    for r in day_rows:
        p, l, ab = r["present_n"], r["late_n"], r["absent_n"]
        if p > 0 and ab == 0 and l == 0:
            day_status = "present"
            days_present += 1
        elif l > 0 and ab == 0 and p == 0:
            day_status = "late"
            days_late += 1
        elif (p > 0 or l > 0) and ab > 0:
            day_status = "partial"
            days_present += 1  # partial still counts as attended day
        elif ab > 0 and p == 0 and l == 0:
            day_status = "absent"
            days_absent += 1
        elif p > 0 or l > 0:
            day_status = "present" if p >= l else "late"
            if day_status == "present":
                days_present += 1
            else:
                days_late += 1
        else:
            day_status = "none"
        calendar.append({
            "date": r["date"].isoformat(),
            "dayStatus": day_status,
            "present": p,
            "late": l,
            "absent": ab,
        })

    days_attended = days_present + days_late
    rate = round((days_attended / school_days) * 100, 1) if school_days > 0 else 0.0

    # Consecutive absent days from the end of the range
    consecutive = 0
    for r in reversed(day_rows):
        p, l, ab = r["present_n"], r["late_n"], r["absent_n"]
        if ab > 0 and p == 0 and l == 0:
            consecutive += 1
        else:
            break

    # Weekly trend
    weekly_rows = await conn.fetch(
        """
        SELECT
          date_trunc('week', a.date)::date AS week_start,
          COUNT(*) FILTER (WHERE a.status = 'present')::int AS present,
          COUNT(*) FILTER (WHERE a.status = 'late')::int AS late,
          COUNT(*) FILTER (WHERE a.status = 'absent')::int AS absent
        FROM attendance a
        WHERE a.school_id = $1
          AND a.student_id = $2
          AND a.term_id = $3
          AND a.date BETWEEN $4 AND $5
        GROUP BY 1
        ORDER BY 1 ASC
        """,
        school_id,
        student_id,
        term_id,
        parsed_from,
        parsed_to,
    )
    weekly_trend = []
    for w in weekly_rows:
        total_m = w["present"] + w["late"] + w["absent"]
        w_rate = round(((w["present"] + w["late"]) / total_m) * 100, 1) if total_m > 0 else 0.0
        weekly_trend.append({
            "weekStart": w["week_start"].isoformat(),
            "present": w["present"],
            "late": w["late"],
            "absent": w["absent"],
            "rate": w_rate,
        })

    by_subject_rows = await conn.fetch(
        """
        SELECT
          COALESCE(ss.name, 'Unknown') AS subject_name,
          COUNT(*) FILTER (WHERE a.status = 'present')::int AS present,
          COUNT(*) FILTER (WHERE a.status = 'late')::int AS late,
          COUNT(*) FILTER (WHERE a.status = 'absent')::int AS absent
        FROM attendance a
        LEFT JOIN timetable_periods tp ON tp.id = a.timetable_period_id
        LEFT JOIN school_subjects ss ON ss.id = tp.subject_id
        WHERE a.school_id = $1
          AND a.student_id = $2
          AND a.term_id = $3
          AND a.date BETWEEN $4 AND $5
        GROUP BY COALESCE(ss.name, 'Unknown')
        ORDER BY subject_name ASC
        """,
        school_id,
        student_id,
        term_id,
        parsed_from,
        parsed_to,
    )
    by_subject = []
    for s in by_subject_rows:
        total_m = s["present"] + s["late"] + s["absent"]
        s_rate = round(((s["present"] + s["late"]) / total_m) * 100, 1) if total_m > 0 else 0.0
        by_subject.append({
            "subjectName": s["subject_name"],
            "present": s["present"],
            "late": s["late"],
            "absent": s["absent"],
            "rate": s_rate,
        })

    absence_rows = await conn.fetch(
        """
        SELECT
          a.date::text AS date,
          a.status,
          a.notes,
          ss.name AS subject_name,
          tp.period_number,
          tp.start_time::text AS start_time,
          u.full_name AS recorded_by_name
        FROM attendance a
        LEFT JOIN timetable_periods tp ON tp.id = a.timetable_period_id
        LEFT JOIN school_subjects ss ON ss.id = tp.subject_id
        LEFT JOIN users u ON u.id = a.recorded_by
        WHERE a.school_id = $1
          AND a.student_id = $2
          AND a.term_id = $3
          AND a.date BETWEEN $4 AND $5
          AND a.status = 'absent'
        ORDER BY a.date DESC, tp.start_time DESC NULLS LAST
        LIMIT 40
        """,
        school_id,
        student_id,
        term_id,
        parsed_from,
        parsed_to,
    )
    recent_absences = []
    for a in absence_rows:
        start_lbl = (a["start_time"] or "")[:5]
        period_label = (
            f"Period {a['period_number']}" + (f" ({start_lbl})" if start_lbl else "")
            if a["period_number"] is not None
            else "—"
        )
        recent_absences.append({
            "date": a["date"],
            "subjectName": a["subject_name"] or "—",
            "periodLabel": period_label,
            "notes": a["notes"],
            "recordedBy": a["recorded_by_name"],
        })

    guardian = await conn.fetchrow(
        """
        SELECT id, full_name, phone, email
        FROM student_guardians
        WHERE student_id = $1 AND school_id = $2 AND is_primary = true
        LIMIT 1
        """,
        student_id,
        school_id,
    )

    recent_notices: list[asyncpg.Record] = []
    try:
        recent_notices = await conn.fetch(
            """
            SELECT
              id::text,
              trigger_type,
              attendance_date::text AS attendance_date,
              status,
              message_body,
              created_at::text AS created_at
            FROM attendance_notifications
            WHERE school_id = $1 AND student_id = $2
            ORDER BY created_at DESC
            LIMIT 10
            """,
            school_id,
            student_id,
        )
    except asyncpg.UndefinedTableError:
        recent_notices = []

    return {
        "data": {
            "studentId": str(student_id),
            "studentName": student["full_name"],
            "learnerId": student["learner_id"] or "N/A",
            "className": _class_display_name(student["level"] or "", student["stream"]) if student["level"] else None,
            "termId": str(term_id),
            "termName": term_row["name"],
            "dateFrom": parsed_from.isoformat(),
            "dateTo": parsed_to.isoformat(),
            "kpis": {
                "attendanceRate": rate,
                "schoolDays": school_days,
                "daysPresent": days_present,
                "daysLate": days_late,
                "daysAbsent": days_absent,
                "daysAttended": days_attended,
                "periodsPresent": period_stats["periods_present"] if period_stats else 0,
                "periodsLate": period_stats["periods_late"] if period_stats else 0,
                "periodsAbsent": period_stats["periods_absent"] if period_stats else 0,
                "consecutiveAbsentDays": consecutive,
                "riskLevel": _risk_level(rate, consecutive),
            },
            "weeklyTrend": weekly_trend,
            "bySubject": by_subject,
            "recentAbsences": recent_absences,
            "calendar": calendar,
            "guardian": {
                "id": str(guardian["id"]) if guardian else None,
                "name": guardian["full_name"] if guardian else None,
                "phone": guardian["phone"] if guardian else None,
                "email": guardian["email"] if guardian else None,
                "canNotify": bool(guardian and guardian["phone"]),
            },
            "recentNotifications": [
                {
                    "id": n["id"],
                    "triggerType": n["trigger_type"],
                    "attendanceDate": n["attendance_date"],
                    "status": n["status"],
                    "messageBody": n["message_body"],
                    "createdAt": n["created_at"],
                }
                for n in recent_notices
            ],
        }
    }


# ── POST /schools/attendance/students/{student_id}/notify ─────────────────────

@router.post("/students/{student_id}/notify")
async def notify_student_parent(
    student_id: uuid.UUID,
    body: NotifyParentPayload,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    _require_allowed_role(actor)
    student = await _assert_can_view_student(conn, actor, student_id, school_id)
    actor_id = _actor_user_id(actor)
    parsed_date = datetime.strptime(body.date, "%Y-%m-%d").date()

    if body.type == "period_absent" and not body.timetable_period_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "timetable_period_id is required for period_absent notifications.",
                "code": "VALIDATION_ERROR",
            },
        )

    guardian = await conn.fetchrow(
        """
        SELECT id, full_name, phone
        FROM student_guardians
        WHERE student_id = $1 AND school_id = $2 AND is_primary = true
        LIMIT 1
        """,
        student_id,
        school_id,
    )
    if not guardian or not guardian["phone"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "Primary guardian phone number is missing.",
                "code": "NO_GUARDIAN_PHONE",
            },
        )

    school = await conn.fetchrow(
        "SELECT name FROM schools WHERE id = $1",
        school_id,
    )
    school_name = school["name"] if school else "School"
    class_name = (
        _class_display_name(student["level"] or "", student["stream"])
        if student.get("level")
        else "—"
    )

    subject_name = None
    if body.timetable_period_id:
        subj = await conn.fetchrow(
            """
            SELECT ss.name AS subject_name
            FROM timetable_periods tp
            JOIN school_subjects ss ON ss.id = tp.subject_id
            WHERE tp.id = $1 AND tp.school_id = $2
            """,
            body.timetable_period_id,
            school_id,
        )
        subject_name = subj["subject_name"] if subj else None

    date_label = parsed_date.strftime("%d %b %Y")
    if body.message and body.message.strip():
        message_body = body.message.strip()
    elif body.type == "period_absent":
        message_body = (
            f"Dear {guardian['full_name']}, {student['full_name']} ({class_name}) was marked absent "
            f"for {subject_name or 'a lesson'} on {date_label}. "
            f"Please contact the school if this is unexpected. — {school_name}"
        )
    elif body.type == "day_absent":
        message_body = (
            f"Dear {guardian['full_name']}, {student['full_name']} ({class_name}) was marked absent "
            f"on {date_label}. Please contact the school if this is unexpected. — {school_name}"
        )
    else:
        message_body = (
            f"Dear {guardian['full_name']}, this is a notice regarding {student['full_name']} "
            f"({class_name}) attendance on {date_label}. Please contact the school for details. — {school_name}"
        )

    # Dedup check (except manual may allow custom but still use unique constraint)
    existing = await conn.fetchrow(
        """
        SELECT id, status FROM attendance_notifications
        WHERE school_id = $1
          AND student_id = $2
          AND trigger_type = $3
          AND attendance_date = $4
          AND COALESCE(timetable_period_id, '00000000-0000-0000-0000-000000000000'::uuid)
              = COALESCE($5::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        """,
        school_id,
        student_id,
        body.type,
        parsed_date,
        body.timetable_period_id,
    )
    if existing and body.type != "manual":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "A notification for this absence was already queued or sent.",
                "code": "ALREADY_NOTIFIED",
            },
        )

    # Manual with same day: allow by appending unique suffix via separate trigger only once per day
    # For manual duplicates, update message and re-queue if skipped/failed; else conflict
    if existing and body.type == "manual":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "A manual notification for this date was already recorded.",
                "code": "ALREADY_NOTIFIED",
            },
        )

    send_status = "queued"
    provider_ref: str | None = None
    sent = False
    response_message = "Parent notification queued."

    if not makyreach_configured():
        send_status = "skipped"
        response_message = (
            "Parent notification prepared. MakyReach SMS is not configured — "
            "the message was saved but not sent."
        )
    else:
        try:
            result = await send_sms(phones=guardian["phone"], message=message_body)
            send_status = "sent"
            sent = True
            provider_ref = str(result.get("provider_ref") or "") or None
            response_message = result.get("message") or "Parent notification sent via SMS."
        except MakyReachNotConfigured:
            send_status = "skipped"
            response_message = (
                "Parent notification prepared. MakyReach SMS is not configured — "
                "the message was saved but not sent."
            )
        except MakyReachError as exc:
            send_status = "failed"
            response_message = str(exc)

    try:
        row = await conn.fetchrow(
            """
            INSERT INTO attendance_notifications
              (school_id, student_id, guardian_id, trigger_type, attendance_date,
               timetable_period_id, channel, message_body, status, provider_ref,
               triggered_by, sent_at)
            VALUES (
              $1, $2, $3, $4, $5, $6, 'sms', $7, $8, $9, $10,
              CASE WHEN $8 = 'sent' THEN now() ELSE NULL END
            )
            RETURNING id, status, created_at, sent_at
            """,
            school_id,
            student_id,
            guardian["id"],
            body.type,
            parsed_date,
            body.timetable_period_id,
            message_body,
            send_status,
            provider_ref,
            actor_id,
        )
    except asyncpg.UndefinedTableError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "Attendance notifications are not set up yet. Run migration 035.",
                "code": "MIGRATION_REQUIRED",
            },
        ) from None

    return {
        "data": {
            "id": str(row["id"]),
            "status": row["status"],
            "queued": send_status == "queued",
            "sent": sent,
            "message": response_message,
            "preview": message_body,
            "guardianPhone": guardian["phone"],
            "guardianName": guardian["full_name"],
            "providerRef": provider_ref,
        }
    }


# ── GET /schools/attendance/admin/overview ────────────────────────────────────

@router.get("/admin/overview")
async def get_admin_overview(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    term_id: uuid.UUID = Query(...),
    date_from: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
    class_id: Optional[uuid.UUID] = Query(None),
):
    school_id, actor = ctx
    _require_admin_role(actor)

    parsed_from = datetime.strptime(date_from, "%Y-%m-%d").date()
    parsed_to = datetime.strptime(date_to, "%Y-%m-%d").date()
    if parsed_from > parsed_to:
        parsed_from = parsed_to

    # Expected registers = distinct class-period slots on weekdays in range
    # that fall on the period's day_of_week, vs submitted (period+date with rows).
    overview = await conn.fetchrow(
        """
        WITH bounds AS (
          SELECT $2::date AS d_from, $3::date AS d_to
        ),
        active_classes AS (
          SELECT sc.id, sc.level, sc.stream
          FROM school_classes sc
          WHERE sc.school_id = $1
            AND ($4::uuid IS NULL OR sc.id = $4)
        ),
        active_students AS (
          SELECT s.id, s.current_class_id
          FROM students s
          WHERE s.school_id = $1
            AND s.status = 'active'
            AND ($4::uuid IS NULL OR s.current_class_id = $4)
        ),
        period_slots AS (
          SELECT tp.id AS period_id, tp.class_id, tp.day_of_week
          FROM timetable_periods tp
          JOIN active_classes ac ON ac.id = tp.class_id
          WHERE tp.school_id = $1
        ),
        calendar_days AS (
          SELECT generate_series(
            (SELECT d_from FROM bounds),
            (SELECT d_to FROM bounds),
            '1 day'::interval
          )::date AS day
        ),
        expected_registers AS (
          SELECT ps.period_id, ps.class_id, cd.day
          FROM period_slots ps
          JOIN calendar_days cd ON EXTRACT(ISODOW FROM cd.day)::int = ps.day_of_week
        ),
        submitted_registers AS (
          SELECT DISTINCT a.timetable_period_id AS period_id, a.class_id, a.date AS day
          FROM attendance a
          WHERE a.school_id = $1
            AND a.term_id = $5
            AND a.date BETWEEN $2 AND $3
            AND a.timetable_period_id IS NOT NULL
            AND ($4::uuid IS NULL OR a.class_id = $4)
        ),
        mark_totals AS (
          SELECT
            COUNT(*) FILTER (WHERE a.status = 'present')::int AS present_count,
            COUNT(*) FILTER (WHERE a.status = 'absent')::int AS absent_count,
            COUNT(*) FILTER (WHERE a.status = 'late')::int AS late_count,
            COUNT(DISTINCT a.date)::int AS school_days
          FROM attendance a
          WHERE a.school_id = $1
            AND a.term_id = $5
            AND a.date BETWEEN $2 AND $3
            AND ($4::uuid IS NULL OR a.class_id = $4)
        )
        SELECT
          (SELECT COUNT(*)::int FROM active_students) AS active_students,
          (SELECT COUNT(*)::int FROM active_classes) AS class_count,
          COALESCE((SELECT school_days FROM mark_totals), 0) AS school_days,
          COALESCE((SELECT present_count FROM mark_totals), 0) AS present_count,
          COALESCE((SELECT absent_count FROM mark_totals), 0) AS absent_count,
          COALESCE((SELECT late_count FROM mark_totals), 0) AS late_count,
          (SELECT COUNT(*)::int FROM submitted_registers) AS registers_submitted,
          (
            SELECT COUNT(*)::int FROM expected_registers er
            WHERE NOT EXISTS (
              SELECT 1 FROM submitted_registers sr
              WHERE sr.period_id = er.period_id AND sr.day = er.day
            )
          ) AS registers_missing
        """,
        school_id,
        parsed_from,
        parsed_to,
        class_id,
        term_id,
    )

    present = overview["present_count"] if overview else 0
    absent = overview["absent_count"] if overview else 0
    late = overview["late_count"] if overview else 0
    marked = present + absent + late
    avg_rate = round(((present + late) / marked) * 100, 1) if marked > 0 else 0.0
    registers_submitted = overview["registers_submitted"] if overview else 0
    registers_missing = overview["registers_missing"] if overview else 0
    registers_expected = registers_submitted + registers_missing

    daily_rows = await conn.fetch(
        """
        SELECT
          a.date::text AS date,
          COUNT(*) FILTER (WHERE a.status = 'present')::int AS present,
          COUNT(*) FILTER (WHERE a.status = 'absent')::int AS absent,
          COUNT(*) FILTER (WHERE a.status = 'late')::int AS late
        FROM attendance a
        WHERE a.school_id = $1
          AND a.term_id = $2
          AND a.date BETWEEN $3 AND $4
          AND ($5::uuid IS NULL OR a.class_id = $5)
        GROUP BY a.date
        ORDER BY a.date ASC
        """,
        school_id,
        term_id,
        parsed_from,
        parsed_to,
        class_id,
    )

    daily_trend = []
    for r in daily_rows:
        day_total = r["present"] + r["absent"] + r["late"]
        rate = round(((r["present"] + r["late"]) / day_total) * 100, 1) if day_total > 0 else 0.0
        daily_trend.append({
            "date": r["date"],
            "present": r["present"],
            "absent": r["absent"],
            "late": r["late"],
            "attendanceRate": rate,
        })

    class_rows = await conn.fetch(
        """
        WITH active_classes AS (
          SELECT sc.id, sc.level, sc.stream
          FROM school_classes sc
          WHERE sc.school_id = $1
            AND ($5::uuid IS NULL OR sc.id = $5)
        ),
        period_slots AS (
          SELECT tp.id AS period_id, tp.class_id, tp.day_of_week
          FROM timetable_periods tp
          JOIN active_classes ac ON ac.id = tp.class_id
          WHERE tp.school_id = $1
        ),
        calendar_days AS (
          SELECT generate_series($3::date, $4::date, '1 day'::interval)::date AS day
        ),
        expected_registers AS (
          SELECT ps.period_id, ps.class_id, cd.day
          FROM period_slots ps
          JOIN calendar_days cd ON EXTRACT(ISODOW FROM cd.day)::int = ps.day_of_week
        ),
        submitted_registers AS (
          SELECT DISTINCT a.timetable_period_id AS period_id, a.class_id, a.date AS day
          FROM attendance a
          WHERE a.school_id = $1
            AND a.term_id = $2
            AND a.date BETWEEN $3 AND $4
            AND a.timetable_period_id IS NOT NULL
            AND ($5::uuid IS NULL OR a.class_id = $5)
        ),
        marks AS (
          SELECT
            a.class_id,
            COUNT(*) FILTER (WHERE a.status = 'present')::int AS present,
            COUNT(*) FILTER (WHERE a.status = 'absent')::int AS absent,
            COUNT(*) FILTER (WHERE a.status = 'late')::int AS late,
            COUNT(DISTINCT a.date)::int AS school_days
          FROM attendance a
          WHERE a.school_id = $1
            AND a.term_id = $2
            AND a.date BETWEEN $3 AND $4
            AND ($5::uuid IS NULL OR a.class_id = $5)
          GROUP BY a.class_id
        ),
        class_students AS (
          SELECT s.current_class_id AS class_id, COUNT(*)::int AS student_count
          FROM students s
          WHERE s.school_id = $1
            AND s.status = 'active'
            AND ($5::uuid IS NULL OR s.current_class_id = $5)
          GROUP BY s.current_class_id
        )
        SELECT
          ac.id AS class_id,
          ac.level,
          ac.stream,
          COALESCE(cs.student_count, 0) AS student_count,
          COALESCE(m.present, 0) AS present,
          COALESCE(m.absent, 0) AS absent,
          COALESCE(m.late, 0) AS late,
          COALESCE(m.school_days, 0) AS school_days,
          (
            SELECT COUNT(*)::int FROM submitted_registers sr WHERE sr.class_id = ac.id
          ) AS registers_submitted,
          (
            SELECT COUNT(*)::int FROM expected_registers er
            WHERE er.class_id = ac.id
              AND NOT EXISTS (
                SELECT 1 FROM submitted_registers sr
                WHERE sr.period_id = er.period_id AND sr.day = er.day
              )
          ) AS registers_missing
        FROM active_classes ac
        LEFT JOIN marks m ON m.class_id = ac.id
        LEFT JOIN class_students cs ON cs.class_id = ac.id
        ORDER BY ac.level, ac.stream NULLS LAST
        """,
        school_id,
        term_id,
        parsed_from,
        parsed_to,
        class_id,
    )

    per_class = []
    for r in class_rows:
        c_marked = r["present"] + r["absent"] + r["late"]
        c_rate = round(((r["present"] + r["late"]) / c_marked) * 100, 1) if c_marked > 0 else 0.0
        per_class.append({
            "classId": str(r["class_id"]),
            "className": _class_display_name(r["level"], r["stream"]),
            "studentCount": r["student_count"],
            "schoolDays": r["school_days"],
            "present": r["present"],
            "absent": r["absent"],
            "late": r["late"],
            "attendanceRate": c_rate,
            "registersSubmitted": r["registers_submitted"],
            "registersMissing": r["registers_missing"],
        })

    return {
        "data": {
            "kpis": {
                "activeStudents": overview["active_students"] if overview else 0,
                "classCount": overview["class_count"] if overview else 0,
                "schoolDays": overview["school_days"] if overview else 0,
                "present": present,
                "absent": absent,
                "late": late,
                "registersSubmitted": registers_submitted,
                "registersMissing": registers_missing,
                "averageAttendanceRate": avg_rate,
            },
            "dailyTrend": daily_trend,
            "statusBreakdown": {
                "present": present,
                "absent": absent,
                "late": late,
            },
            "registerCompliance": {
                "submitted": registers_submitted,
                "missing": registers_missing,
                "expected": registers_expected,
                "complianceRate": (
                    round((registers_submitted / registers_expected) * 100, 1)
                    if registers_expected > 0
                    else 0.0
                ),
            },
            "perClass": per_class,
        }
    }


# ── GET /schools/attendance ────────────────────────────────────────────────────

@router.get("")
async def get_daily_attendance(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    timetable_slot_id: Optional[uuid.UUID] = Query(None),
    class_id: Optional[uuid.UUID] = Query(None),
    term_id: uuid.UUID = Query(...),
    date: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
):
    school_id, actor = ctx
    _require_allowed_role(actor)

    actor_id = uuid.UUID(str(actor["sub"]))
    parsed_date = datetime.strptime(date, "%Y-%m-%d").date()

    if actor["role"] == "teacher":
        if not timetable_slot_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "Teachers must provide timetable_slot_id to view records.",
                    "code": "VALIDATION_ERROR",
                },
            )
        target_class_id = await _assert_teacher_owns_period(conn, actor_id, timetable_slot_id, school_id)
    else:
        if not class_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "Admins must provide class_id to view a class-wide roster.",
                    "code": "VALIDATION_ERROR",
                },
            )
        target_class_id = class_id

    rows = await conn.fetch(
        """
        SELECT
          s.id              AS student_id,
          s.full_name       AS student_name,
          s.learner_id      AS learner_id,
          a.status,
          a.notes
        FROM students s
        LEFT JOIN LATERAL (
          SELECT att.status, att.notes
          FROM attendance att
          WHERE att.student_id = s.id
            AND att.date = $1
            AND att.term_id = $2
            AND att.school_id = $3
            AND ($4::uuid IS NULL OR att.timetable_period_id = $4)
          ORDER BY
            CASE att.status
              WHEN 'absent' THEN 0
              WHEN 'late' THEN 1
              WHEN 'present' THEN 2
              ELSE 3
            END,
            att.created_at DESC NULLS LAST
          LIMIT 1
        ) a ON true
        WHERE s.current_class_id = $5
          AND s.status = 'active'
          AND s.school_id = $3
        ORDER BY s.full_name ASC
        """,
        parsed_date,
        term_id,
        school_id,
        timetable_slot_id,
        target_class_id,
    )

    already_submitted = any(r["status"] is not None for r in rows)

    return {
        "data": {
            "date": date,
            "classId": str(target_class_id),
            "timetableSlotId": str(timetable_slot_id) if timetable_slot_id else None,
            "termId": str(term_id),
            "alreadySubmitted": already_submitted,
            "students": [
                {
                    "studentId":   str(r["student_id"]),
                    "studentName": r["student_name"],
                    "learnerId":   r["learner_id"] or "N/A",
                    "status":      r["status"],
                    "notes":       r["notes"],
                }
                for r in rows
            ],
        }
    }


# ── POST /schools/attendance/bulk ─────────────────────────────────────────────

@router.post("/bulk")
async def save_bulk_attendance(
    body: BulkAttendancePayload,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx

    if actor["role"] != "teacher":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "Only teachers can record attendance.",
                "code": "FORBIDDEN",
            },
        )

    actor_id = uuid.UUID(str(actor["sub"]))
    parsed_date = datetime.strptime(body.date, "%Y-%m-%d").date()

    class_id = await _assert_teacher_owns_period(conn, actor_id, body.timetable_period_id, school_id)

    already_submitted = await conn.fetchval(
        """
        SELECT EXISTS(
            SELECT 1 FROM attendance
            WHERE timetable_period_id = $1 AND date = $2 AND school_id = $3
        )
        """,
        body.timetable_period_id,
        parsed_date,
        school_id,
    )
    if already_submitted:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "Attendance for this period has already been submitted and is locked.",
                "code": "ALREADY_SUBMITTED",
            },
        )

    student_ids = [e.student_id for e in body.entries]
    statuses = [e.status for e in body.entries]
    notes_list = [e.notes for e in body.entries]

    async with conn.transaction():
        await conn.execute(
            """
            INSERT INTO attendance
              (school_id, class_id, timetable_period_id, student_id, term_id,
               date, status, notes, recorded_by)
            SELECT
              $1,
              $2,
              $3,
              u.student_id,
              $4,
              $5,
              u.status,
              u.notes,
              $6
            FROM unnest($7::uuid[], $8::text[], $9::text[])
              AS u(student_id, status, notes)
            """,
            school_id,
            class_id,
            body.timetable_period_id,
            body.term_id,
            parsed_date,
            actor_id,
            student_ids,
            statuses,
            notes_list,
        )

    return {
        "data": {
            "saved": len(body.entries),
            "date":  body.date,
            "timetableSlotId": str(body.timetable_period_id),
        }
    }


# ── GET /schools/attendance/monthly ──────────────────────────────────────────

@router.get("/monthly")
async def get_monthly_overview(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    class_id: uuid.UUID = Query(...),
    term_id: uuid.UUID = Query(...),
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
):
    school_id, actor = ctx
    _require_allowed_role(actor)

    period_ids = [
        r["id"] for r in await conn.fetch(
            "SELECT id FROM timetable_periods WHERE class_id = $1 AND school_id = $2",
            class_id, school_id
        )
    ]

    if not period_ids:
        return {
            "data": {
                "classId": str(class_id),
                "termId": str(term_id),
                "month": month,
                "schoolDays": [],
                "rows": [],
            }
        }

    rows = await conn.fetch(
        """
        SELECT
          s.id                 AS student_id,
          s.full_name          AS student_name,
          s.learner_id         AS learner_id,
          a.date::text         AS date,
          ss.name               AS subject_name,
          a.status
        FROM students s
        LEFT JOIN attendance a
          ON a.student_id = s.id
         AND a.term_id    = $2
         AND to_char(a.date, 'YYYY-MM') = $3
         AND a.school_id  = $4
         AND a.timetable_period_id = ANY($5)
        LEFT JOIN timetable_periods tp ON tp.id = a.timetable_period_id
        LEFT JOIN school_subjects ss ON ss.id = tp.subject_id
        WHERE s.current_class_id = $1
          AND s.status = 'active'
          AND s.school_id = $4
        ORDER BY s.full_name ASC, a.date ASC
        """,
        class_id,
        term_id,
        month,
        school_id,
        period_ids,
    )

    student_map: dict[str, dict] = {}
    session_columns: set[str] = set()

    for r in rows:
        sid = str(r["student_id"])
        if sid not in student_map:
            student_map[sid] = {
                "studentId":   sid,
                "studentName": r["student_name"],
                "learnerId":   r["learner_id"] or "N/A",
                "days":        {},
            }

        if r["date"] and r["status"] and r["subject_name"]:
            column_key = f"{r['date']} ({r['subject_name']})"
            student_map[sid]["days"][column_key] = r["status"]
            session_columns.add(column_key)

    result_rows = []
    for student in student_map.values():
        attended = sum(1 for s in student["days"].values() if s in ("present", "late"))
        result_rows.append({
            **student,
            "daysAttended": attended,
            "totalDays":    len(session_columns),
        })

    return {
        "data": {
            "classId":    str(class_id),
            "termId":     str(term_id),
            "month":      month,
            "schoolDays": sorted(list(session_columns)),
            "rows":       result_rows,
        }
    }
