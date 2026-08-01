"""Teacher GPS attendance — clock-in/out, geofencing, admin map & history."""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta
from typing import Annotated, Any, Literal
from zoneinfo import ZoneInfo

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field

from app.db.pool import get_db
from app.lib.geo import is_within_fence
from app.lib.permissions import can
from app.middleware.subscription_guard import require_tenant_with_subscription

router = APIRouter()

TenantCtx = Annotated[
    tuple[uuid.UUID, dict[str, Any]],
    Depends(require_tenant_with_subscription),
]

LOCAL_TZ = ZoneInfo("Africa/Kampala")
AttendanceStatus = Literal["present", "late", "outside_fence", "absent", "partial"]


def _actor_id(actor: dict[str, Any]) -> uuid.UUID:
    return uuid.UUID(str(actor.get("user_db_id") or actor["sub"]))


def _role(actor: dict[str, Any]) -> str:
    role = (actor.get("role") or "").lower()
    return "learner" if role == "student" else role


def _require(actor: dict[str, Any], action: str, message: str = "Forbidden.") -> None:
    if not can(_role(actor), action):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": message, "code": "FORBIDDEN"},
        )


def _fmt_time(dt: datetime | None) -> str | None:
    if not dt:
        return None
    local = dt.astimezone(LOCAL_TZ)
    return local.strftime("%I:%M %p").lstrip("0")


def _fmt_duration(minutes: int | None) -> str | None:
    if minutes is None:
        return None
    hours, mins = divmod(max(0, minutes), 60)
    if hours and mins:
        return f"{hours} hour{'s' if hours != 1 else ''} {mins} minute{'s' if mins != 1 else ''}"
    if hours:
        return f"{hours} hour{'s' if hours != 1 else ''}"
    return f"{mins} minute{'s' if mins != 1 else ''}"


def _initials(name: str | None) -> str:
    parts = [p for p in (name or "").strip().split() if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return f"{parts[0][0]}{parts[-1][0]}".upper()


def _client_meta(request: Request) -> tuple[str | None, str | None]:
    ua = request.headers.get("user-agent")
    forwarded = request.headers.get("x-forwarded-for")
    ip = (forwarded.split(",")[0].strip() if forwarded else None) or (
        request.client.host if request.client else None
    )
    return ua, ip


def _parse_hhmm(value: str, field: str) -> time:
    raw = (value or "").strip()
    try:
        parts = raw.split(":")
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
        return time(hour=hour, minute=minute)
    except (ValueError, IndexError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"error": f"Invalid {field}. Use HH:MM.", "code": "VALIDATION_ERROR"},
        ) from exc


def _time_to_hhmm(value: time | None, default: str) -> str:
    if value is None:
        return default
    return f"{value.hour:02d}:{value.minute:02d}"


async def _ensure_settings(conn: asyncpg.Connection, school_id: uuid.UUID) -> asyncpg.Record:
    row = await conn.fetchrow(
        "SELECT * FROM attendance_settings WHERE school_id = $1",
        school_id,
    )
    if row:
        return row
    await conn.execute(
        """
        INSERT INTO attendance_settings (school_id)
        VALUES ($1)
        ON CONFLICT (school_id) DO NOTHING
        """,
        school_id,
    )
    row = await conn.fetchrow(
        "SELECT * FROM attendance_settings WHERE school_id = $1",
        school_id,
    )
    assert row is not None
    return row


async def _school_geo(
    conn: asyncpg.Connection, school_id: uuid.UUID
) -> dict[str, Any]:
    settings = await _ensure_settings(conn, school_id)
    school = await conn.fetchrow(
        """
        SELECT name, latitude, longitude, attendance_radius_metres
        FROM schools WHERE id = $1
        """,
        school_id,
    )
    if not school:
        raise HTTPException(
            status_code=404,
            detail={"error": "School not found.", "code": "NOT_FOUND"},
        )
    radius = settings["radius_metres"] or school["attendance_radius_metres"] or 200
    lat = float(school["latitude"]) if school["latitude"] is not None else None
    lng = float(school["longitude"]) if school["longitude"] is not None else None
    return {
        "name": school["name"],
        "latitude": lat,
        "longitude": lng,
        "radius_metres": int(radius),
        "is_configured": lat is not None and lng is not None,
        "enforce_geofence": bool(settings["enforce_geofence"]),
        "allow_outside_fence": bool(settings["allow_outside_fence"]),
        "clock_in_deadline": settings["clock_in_deadline"],
        "auto_absent_after": settings["auto_absent_after"],
        "notify_admin_on_late": bool(settings["notify_admin_on_late"]),
    }


# ── Bodies ────────────────────────────────────────────────────────────────────


class SettingsPatchBody(BaseModel):
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    radius_metres: int | None = Field(default=None, ge=50, le=2000)
    clock_in_deadline: str | None = None
    auto_absent_after: str | None = None
    enforce_geofence: bool | None = None
    allow_outside_fence: bool | None = None
    notify_admin_on_late: bool | None = None


class ClockBody(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy_metres: float = Field(ge=0)


class ManualMarkBody(BaseModel):
    teacher_id: uuid.UUID
    date: date
    status: Literal["present", "late", "absent"]
    reason: str = Field(min_length=1, max_length=500)
    clock_in_time: str | None = None
    clock_out_time: str | None = None


# ── Settings ──────────────────────────────────────────────────────────────────


@router.get("/settings")
async def get_settings(ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)):
    school_id, actor = ctx
    _require(actor, "viewTeacherAttendance", "You cannot view attendance settings.")
    geo = await _school_geo(conn, school_id)
    return {
        "data": {
            "school_location": {
                "latitude": geo["latitude"],
                "longitude": geo["longitude"],
                "radius_metres": geo["radius_metres"],
                "is_configured": geo["is_configured"],
            },
            "settings": {
                "clock_in_deadline": _time_to_hhmm(geo["clock_in_deadline"], "08:00"),
                "auto_absent_after": _time_to_hhmm(geo["auto_absent_after"], "09:30"),
                "enforce_geofence": geo["enforce_geofence"],
                "allow_outside_fence": geo["allow_outside_fence"],
                "notify_admin_on_late": geo["notify_admin_on_late"],
            },
        }
    }


@router.patch("/settings")
async def patch_settings(
    body: SettingsPatchBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    _require(actor, "manageAttendanceSettings", "Only an admin can update attendance settings.")
    await _ensure_settings(conn, school_id)

    if body.latitude is not None or body.longitude is not None or body.radius_metres is not None:
        await conn.execute(
            """
            UPDATE schools SET
              latitude = COALESCE($2, latitude),
              longitude = COALESCE($3, longitude),
              attendance_radius_metres = COALESCE($4, attendance_radius_metres),
              updated_at = NOW()
            WHERE id = $1
            """,
            school_id,
            body.latitude,
            body.longitude,
            body.radius_metres,
        )

    deadline = (
        _parse_hhmm(body.clock_in_deadline, "clock_in_deadline")
        if body.clock_in_deadline is not None
        else None
    )
    auto_absent = (
        _parse_hhmm(body.auto_absent_after, "auto_absent_after")
        if body.auto_absent_after is not None
        else None
    )

    await conn.execute(
        """
        UPDATE attendance_settings SET
          clock_in_deadline = COALESCE($2, clock_in_deadline),
          auto_absent_after = COALESCE($3, auto_absent_after),
          enforce_geofence = COALESCE($4, enforce_geofence),
          allow_outside_fence = COALESCE($5, allow_outside_fence),
          radius_metres = COALESCE($6, radius_metres),
          notify_admin_on_late = COALESCE($7, notify_admin_on_late),
          updated_at = NOW()
        WHERE school_id = $1
        """,
        school_id,
        deadline,
        auto_absent,
        body.enforce_geofence,
        body.allow_outside_fence,
        body.radius_metres,
        body.notify_admin_on_late,
    )

    geo = await _school_geo(conn, school_id)
    return {
        "data": {
            "school_location": {
                "latitude": geo["latitude"],
                "longitude": geo["longitude"],
                "radius_metres": geo["radius_metres"],
                "is_configured": geo["is_configured"],
            },
            "settings": {
                "clock_in_deadline": _time_to_hhmm(geo["clock_in_deadline"], "08:00"),
                "auto_absent_after": _time_to_hhmm(geo["auto_absent_after"], "09:30"),
                "enforce_geofence": geo["enforce_geofence"],
                "allow_outside_fence": geo["allow_outside_fence"],
                "notify_admin_on_late": geo["notify_admin_on_late"],
            },
        },
        "message": "Attendance settings saved.",
    }


# ── Clock in / out ────────────────────────────────────────────────────────────


@router.post("/clock-in")
async def clock_in(
    body: ClockBody,
    request: Request,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    if _role(actor) == "learner":
        raise HTTPException(
            status_code=403,
            detail={"error": "Learners cannot clock in.", "code": "FORBIDDEN"},
        )
    teacher_id = _actor_id(actor)
    today = datetime.now(LOCAL_TZ).date()

    existing = await conn.fetchrow(
        """
        SELECT id, clock_in_at FROM teacher_attendance
        WHERE school_id = $1 AND teacher_id = $2 AND attendance_date = $3
        """,
        school_id,
        teacher_id,
        today,
    )
    if existing and existing["clock_in_at"] is not None:
        when = _fmt_time(existing["clock_in_at"])
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": f"You have already clocked in today at {when}.",
                "code": "ALREADY_CLOCKED_IN",
            },
        )

    geo = await _school_geo(conn, school_id)
    distance: float | None = None
    within = True
    if geo["is_configured"]:
        within, distance = is_within_fence(
            body.latitude,
            body.longitude,
            geo["latitude"],
            geo["longitude"],
            geo["radius_metres"],
        )
        if (
            geo["enforce_geofence"]
            and not within
            and not geo["allow_outside_fence"]
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "error": (
                        f"You are too far from school. You must be within "
                        f"{geo['radius_metres']} metres to clock in. "
                        f"Your current distance: {int(distance)} metres."
                    ),
                    "code": "OUTSIDE_GEOFENCE",
                    "distance_metres": distance,
                    "allowed_metres": geo["radius_metres"],
                },
            )

    now = datetime.now(LOCAL_TZ)
    deadline: time = geo["clock_in_deadline"] or time(8, 0)
    is_late = now.time() > deadline
    if not within and geo["allow_outside_fence"]:
        status_value: AttendanceStatus = "outside_fence"
    elif is_late:
        status_value = "late"
    else:
        status_value = "present"

    ua, ip = _client_meta(request)
    row = await conn.fetchrow(
        """
        INSERT INTO teacher_attendance (
          school_id, teacher_id, attendance_date,
          clock_in_at, clock_in_lat, clock_in_lng,
          clock_in_accuracy_metres, clock_in_distance_metres,
          clock_in_within_fence, status,
          user_agent, ip_address, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()
        )
        ON CONFLICT (school_id, teacher_id, attendance_date)
        DO UPDATE SET
          clock_in_at = EXCLUDED.clock_in_at,
          clock_in_lat = EXCLUDED.clock_in_lat,
          clock_in_lng = EXCLUDED.clock_in_lng,
          clock_in_accuracy_metres = EXCLUDED.clock_in_accuracy_metres,
          clock_in_distance_metres = EXCLUDED.clock_in_distance_metres,
          clock_in_within_fence = EXCLUDED.clock_in_within_fence,
          status = EXCLUDED.status,
          user_agent = EXCLUDED.user_agent,
          ip_address = EXCLUDED.ip_address,
          is_manual = false,
          manual_reason = NULL,
          marked_by = NULL,
          updated_at = NOW()
        RETURNING clock_in_at, status, clock_in_distance_metres, clock_in_within_fence
        """,
        school_id,
        teacher_id,
        today,
        now,
        body.latitude,
        body.longitude,
        body.accuracy_metres,
        distance,
        within if geo["is_configured"] else None,
        status_value,
        ua,
        ip,
    )

    clock_label = _fmt_time(row["clock_in_at"]) or ""
    if status_value == "late":
        deadline_dt = datetime.combine(today, deadline, tzinfo=LOCAL_TZ)
        late_mins = max(1, int((now - deadline_dt).total_seconds() // 60))
        message = f"Clocked in at {clock_label}. You are {late_mins} minutes late."
    else:
        message = f"Clocked in successfully at {clock_label}."

    return {
        "data": {
            "message": message,
            "status": row["status"],
            "clock_in_at": row["clock_in_at"].isoformat(),
            "distance_metres": (
                float(row["clock_in_distance_metres"])
                if row["clock_in_distance_metres"] is not None
                else None
            ),
            "within_fence": row["clock_in_within_fence"],
            "is_late": status_value == "late",
        },
        "message": message,
    }


@router.post("/clock-out")
async def clock_out(
    body: ClockBody,
    request: Request,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    if _role(actor) == "learner":
        raise HTTPException(
            status_code=403,
            detail={"error": "Learners cannot clock out.", "code": "FORBIDDEN"},
        )
    teacher_id = _actor_id(actor)
    today = datetime.now(LOCAL_TZ).date()

    existing = await conn.fetchrow(
        """
        SELECT id, clock_in_at, clock_out_at FROM teacher_attendance
        WHERE school_id = $1 AND teacher_id = $2 AND attendance_date = $3
        """,
        school_id,
        teacher_id,
        today,
    )
    if not existing or existing["clock_in_at"] is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "error": "You have not clocked in today. Please clock in first.",
                "code": "NOT_CLOCKED_IN",
            },
        )
    if existing["clock_out_at"] is not None:
        when = _fmt_time(existing["clock_out_at"])
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": f"You have already clocked out today at {when}.",
                "code": "ALREADY_CLOCKED_OUT",
            },
        )

    geo = await _school_geo(conn, school_id)
    distance: float | None = None
    within: bool | None = None
    if geo["is_configured"]:
        within, distance = is_within_fence(
            body.latitude,
            body.longitude,
            geo["latitude"],
            geo["longitude"],
            geo["radius_metres"],
        )

    now = datetime.now(LOCAL_TZ)
    clock_in_at = existing["clock_in_at"]
    if clock_in_at.tzinfo is None:
        clock_in_at = clock_in_at.replace(tzinfo=LOCAL_TZ)
    duration = max(0, int((now - clock_in_at.astimezone(LOCAL_TZ)).total_seconds() // 60))
    ua, ip = _client_meta(request)

    row = await conn.fetchrow(
        """
        UPDATE teacher_attendance SET
          clock_out_at = $4,
          clock_out_lat = $5,
          clock_out_lng = $6,
          clock_out_accuracy_metres = $7,
          clock_out_distance_metres = $8,
          clock_out_within_fence = $9,
          duration_minutes = $10,
          user_agent = COALESCE($11, user_agent),
          ip_address = COALESCE($12, ip_address),
          updated_at = NOW()
        WHERE school_id = $1 AND teacher_id = $2 AND attendance_date = $3
        RETURNING clock_out_at, duration_minutes, clock_out_distance_metres
        """,
        school_id,
        teacher_id,
        today,
        now,
        body.latitude,
        body.longitude,
        body.accuracy_metres,
        distance,
        within,
        duration,
        ua,
        ip,
    )

    clock_label = _fmt_time(row["clock_out_at"]) or ""
    dur_label = _fmt_duration(row["duration_minutes"]) or "0 minutes"
    message = f"Clocked out at {clock_label}. Duration: {dur_label}."
    return {
        "data": {
            "message": message,
            "clock_out_at": row["clock_out_at"].isoformat(),
            "duration_minutes": row["duration_minutes"],
            "distance_metres": (
                float(row["clock_out_distance_metres"])
                if row["clock_out_distance_metres"] is not None
                else None
            ),
        },
        "message": message,
    }


@router.get("/my-status")
async def my_status(ctx: TenantCtx, conn: asyncpg.Connection = Depends(get_db)):
    school_id, actor = ctx
    teacher_id = _actor_id(actor)
    today = datetime.now(LOCAL_TZ).date()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)

    today_row = await conn.fetchrow(
        """
        SELECT attendance_date, status, clock_in_at, clock_out_at,
               duration_minutes, clock_in_distance_metres
        FROM teacher_attendance
        WHERE school_id = $1 AND teacher_id = $2 AND attendance_date = $3
        """,
        school_id,
        teacher_id,
        today,
    )

    week_rows = await conn.fetch(
        """
        SELECT status FROM teacher_attendance
        WHERE school_id = $1 AND teacher_id = $2
          AND attendance_date >= $3 AND attendance_date <= $4
        """,
        school_id,
        teacher_id,
        week_start,
        today,
    )
    month_rows = await conn.fetch(
        """
        SELECT status FROM teacher_attendance
        WHERE school_id = $1 AND teacher_id = $2
          AND attendance_date >= $3 AND attendance_date <= $4
        """,
        school_id,
        teacher_id,
        month_start,
        today,
    )

    def count_status(rows: list[asyncpg.Record], key: str) -> int:
        return sum(1 for r in rows if r["status"] == key)

    week = {
        "present": count_status(week_rows, "present"),
        "late": count_status(week_rows, "late"),
        "absent": count_status(week_rows, "absent"),
    }
    month_present = count_status(month_rows, "present")
    month_late = count_status(month_rows, "late")
    month_absent = count_status(month_rows, "absent")
    month_days = max(1, (today - month_start).days + 1)
    attended = month_present + month_late
    month = {
        "present": month_present,
        "late": month_late,
        "absent": month_absent,
        "attendance_percent": round(attended / month_days * 100, 1),
    }

    today_payload = None
    if today_row:
        today_payload = {
            "date": today_row["attendance_date"].isoformat(),
            "status": today_row["status"],
            "clock_in_at": (
                today_row["clock_in_at"].isoformat() if today_row["clock_in_at"] else None
            ),
            "clock_out_at": (
                today_row["clock_out_at"].isoformat() if today_row["clock_out_at"] else None
            ),
            "duration_minutes": today_row["duration_minutes"],
            "clock_in_distance_metres": (
                float(today_row["clock_in_distance_metres"])
                if today_row["clock_in_distance_metres"] is not None
                else None
            ),
            "is_clocked_in": today_row["clock_in_at"] is not None,
            "is_clocked_out": today_row["clock_out_at"] is not None,
        }

    geo = await _school_geo(conn, school_id)
    recent = await conn.fetch(
        """
        SELECT attendance_date, status, clock_in_at, clock_out_at, duration_minutes
        FROM teacher_attendance
        WHERE school_id = $1 AND teacher_id = $2
        ORDER BY attendance_date DESC
        LIMIT 5
        """,
        school_id,
        teacher_id,
    )

    return {
        "data": {
            "today": today_payload,
            "this_week": week,
            "this_month": month,
            "school_location": {
                "latitude": geo["latitude"],
                "longitude": geo["longitude"],
                "radius_metres": geo["radius_metres"],
                "is_configured": geo["is_configured"],
            },
            "settings": {
                "clock_in_deadline": _time_to_hhmm(geo["clock_in_deadline"], "08:00"),
                "enforce_geofence": geo["enforce_geofence"],
                "allow_outside_fence": geo["allow_outside_fence"],
            },
            "recent": [
                {
                    "date": r["attendance_date"].isoformat(),
                    "status": r["status"],
                    "clock_in_at": r["clock_in_at"].isoformat() if r["clock_in_at"] else None,
                    "clock_out_at": r["clock_out_at"].isoformat() if r["clock_out_at"] else None,
                    "duration_minutes": r["duration_minutes"],
                }
                for r in recent
            ],
        }
    }


# ── Admin ─────────────────────────────────────────────────────────────────────


@router.get("/today")
async def today_list(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    on_date: date | None = Query(None, alias="date"),
):
    school_id, actor = ctx
    _require(actor, "viewTeacherAttendance", "You cannot view teacher attendance.")
    target = on_date or datetime.now(LOCAL_TZ).date()
    geo = await _school_geo(conn, school_id)
    auto_absent: time = geo["auto_absent_after"] or time(9, 30)
    now = datetime.now(LOCAL_TZ)
    after_cutoff = target < now.date() or (
        target == now.date() and now.time() >= auto_absent
    )

    rows = await conn.fetch(
        """
        SELECT
          u.id AS teacher_id,
          u.full_name,
          u.email,
          u.avatar_url AS photo_url,
          COALESCE(ta.status, 'absent') AS status,
          ta.clock_in_at,
          ta.clock_out_at,
          ta.clock_in_lat,
          ta.clock_in_lng,
          ta.clock_in_distance_metres,
          ta.duration_minutes,
          ta.is_manual,
          ta.manual_reason
        FROM users u
        LEFT JOIN teacher_attendance ta
          ON ta.teacher_id = u.id
          AND ta.school_id = $1
          AND ta.attendance_date = $2
        WHERE u.school_id = $1
          AND lower(u.role) = 'teacher'
          AND u.is_active = true
          AND u.deleted_at IS NULL
        ORDER BY u.full_name ASC
        """,
        school_id,
        target,
    )

    teachers = []
    counts = {
        "present": 0,
        "late": 0,
        "absent": 0,
        "outside_fence": 0,
        "not_yet_arrived": 0,
        "partial": 0,
    }
    for r in rows:
        has_record = r["clock_in_at"] is not None or r["is_manual"]
        status_value = r["status"]
        display_status = status_value
        if not has_record:
            if after_cutoff:
                display_status = "absent"
                counts["absent"] += 1
            else:
                display_status = "not_yet_arrived"
                counts["not_yet_arrived"] += 1
        else:
            key = status_value if status_value in counts else "absent"
            counts[key] = counts.get(key, 0) + 1

        teachers.append(
            {
                "teacher_id": str(r["teacher_id"]),
                "full_name": r["full_name"],
                "email": r["email"],
                "photo_url": r["photo_url"],
                "status": display_status,
                "clock_in_at": r["clock_in_at"].isoformat() if r["clock_in_at"] else None,
                "clock_out_at": r["clock_out_at"].isoformat() if r["clock_out_at"] else None,
                "clock_in_distance_metres": (
                    float(r["clock_in_distance_metres"])
                    if r["clock_in_distance_metres"] is not None
                    else None
                ),
                "clock_in_lat": float(r["clock_in_lat"]) if r["clock_in_lat"] is not None else None,
                "clock_in_lng": float(r["clock_in_lng"]) if r["clock_in_lng"] is not None else None,
                "duration_minutes": r["duration_minutes"],
                "is_manual": bool(r["is_manual"]) if r["is_manual"] is not None else False,
                "manual_reason": r["manual_reason"],
            }
        )

    total = len(teachers)
    arrived = counts["present"] + counts["late"] + counts["outside_fence"] + counts["partial"]
    rate = round(arrived / total * 100, 1) if total else 0.0

    return {
        "data": {
            "date": target.isoformat(),
            "summary": {
                "total_teachers": total,
                "present": counts["present"],
                "late": counts["late"],
                "absent": counts["absent"],
                "outside_fence": counts["outside_fence"],
                "not_yet_arrived": counts["not_yet_arrived"],
                "attendance_rate": rate,
            },
            "teachers": teachers,
        }
    }


@router.get("/history")
async def history(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    teacher_id: uuid.UUID | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=100),
):
    school_id, actor = ctx
    _require(actor, "viewTeacherAttendance", "You cannot view teacher attendance.")
    today = datetime.now(LOCAL_TZ).date()
    start = date_from or (today - timedelta(days=30))
    end = date_to or today

    clauses = ["ta.school_id = $1", "ta.attendance_date >= $2", "ta.attendance_date <= $3"]
    args: list[Any] = [school_id, start, end]
    idx = 4
    if teacher_id:
        clauses.append(f"ta.teacher_id = ${idx}")
        args.append(teacher_id)
        idx += 1
    if status_filter:
        clauses.append(f"ta.status = ${idx}")
        args.append(status_filter)
        idx += 1

    where = " AND ".join(clauses)
    total = await conn.fetchval(
        f"SELECT COUNT(*)::int FROM teacher_attendance ta WHERE {where}",
        *args,
    )
    offset = (page - 1) * limit
    rows = await conn.fetch(
        f"""
        SELECT ta.*, u.full_name, u.email, u.avatar_url AS photo_url
        FROM teacher_attendance ta
        JOIN users u ON u.id = ta.teacher_id
        WHERE {where}
        ORDER BY ta.attendance_date DESC, u.full_name ASC
        LIMIT ${idx} OFFSET ${idx + 1}
        """,
        *args,
        limit,
        offset,
    )

    summary_rows = await conn.fetch(
        f"""
        SELECT status, COUNT(*)::int AS cnt
        FROM teacher_attendance ta
        WHERE {where}
        GROUP BY status
        """,
        *args,
    )
    summary = {r["status"]: r["cnt"] for r in summary_rows}

    return {
        "data": {
            "page": page,
            "limit": limit,
            "total": total,
            "summary": summary,
            "records": [
                {
                    "id": str(r["id"]),
                    "teacher_id": str(r["teacher_id"]),
                    "full_name": r["full_name"],
                    "email": r["email"],
                    "date": r["attendance_date"].isoformat(),
                    "status": r["status"],
                    "clock_in_at": r["clock_in_at"].isoformat() if r["clock_in_at"] else None,
                    "clock_out_at": r["clock_out_at"].isoformat() if r["clock_out_at"] else None,
                    "duration_minutes": r["duration_minutes"],
                    "clock_in_distance_metres": (
                        float(r["clock_in_distance_metres"])
                        if r["clock_in_distance_metres"] is not None
                        else None
                    ),
                    "is_manual": bool(r["is_manual"]),
                    "manual_reason": r["manual_reason"],
                }
                for r in rows
            ],
        }
    }


@router.get("/teacher/{teacher_id}")
async def teacher_detail(
    teacher_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    month: str | None = Query(None, description="YYYY-MM"),
):
    school_id, actor = ctx
    _require(actor, "viewTeacherAttendance", "You cannot view teacher attendance.")

    teacher = await conn.fetchrow(
        """
        SELECT id, full_name, email, avatar_url AS photo_url, role, subject_specialization
        FROM users
        WHERE id = $1 AND school_id = $2 AND lower(role) = 'teacher'
        """,
        teacher_id,
        school_id,
    )
    if not teacher:
        raise HTTPException(
            status_code=404,
            detail={"error": "Teacher not found.", "code": "NOT_FOUND"},
        )

    now = datetime.now(LOCAL_TZ)
    if month:
        try:
            year_s, month_s = month.split("-")
            month_start = date(int(year_s), int(month_s), 1)
        except (ValueError, TypeError) as exc:
            raise HTTPException(
                status_code=422,
                detail={"error": "Invalid month. Use YYYY-MM.", "code": "VALIDATION_ERROR"},
            ) from exc
    else:
        month_start = now.date().replace(day=1)

    if month_start.month == 12:
        month_end = date(month_start.year + 1, 1, 1) - timedelta(days=1)
    else:
        month_end = date(month_start.year, month_start.month + 1, 1) - timedelta(days=1)
    month_end = min(month_end, now.date())

    records = await conn.fetch(
        """
        SELECT * FROM teacher_attendance
        WHERE school_id = $1 AND teacher_id = $2
          AND attendance_date >= $3 AND attendance_date <= $4
        ORDER BY attendance_date DESC
        """,
        school_id,
        teacher_id,
        month_start,
        month_end,
    )

    present = sum(1 for r in records if r["status"] == "present")
    late = sum(1 for r in records if r["status"] == "late")
    absent = sum(1 for r in records if r["status"] == "absent")
    outside = sum(1 for r in records if r["status"] == "outside_fence")
    working_days = 0
    d = month_start
    while d <= month_end:
        if d.weekday() < 5:
            working_days += 1
        d += timedelta(days=1)
    attended = present + late + outside
    pct = round(attended / working_days * 100, 1) if working_days else 0.0

    clock_ins = [r["clock_in_at"] for r in records if r["clock_in_at"]]
    durations = [r["duration_minutes"] for r in records if r["duration_minutes"] is not None]
    avg_clock = None
    if clock_ins:
        minutes = []
        for c in clock_ins:
            local = c.astimezone(LOCAL_TZ) if c.tzinfo else c.replace(tzinfo=LOCAL_TZ)
            minutes.append(local.hour * 60 + local.minute)
        avg = int(sum(minutes) / len(minutes))
        avg_clock = f"{avg // 60:02d}:{avg % 60:02d}"
    avg_duration = int(sum(durations) / len(durations)) if durations else None

    assignments = await conn.fetch(
        """
        SELECT DISTINCT
          CASE
            WHEN sc.stream IS NULL OR sc.stream = '' THEN sc.level
            ELSE sc.level || ' ' || sc.stream
          END AS class_name
        FROM teacher_class_assignments tca
        JOIN school_classes sc ON sc.id = tca.class_id
        WHERE tca.school_id = $1 AND tca.teacher_id = $2
        ORDER BY 1
        """,
        school_id,
        teacher_id,
    )

    return {
        "data": {
            "teacher": {
                "id": str(teacher["id"]),
                "full_name": teacher["full_name"],
                "email": teacher["email"],
                "photo_url": teacher["photo_url"],
                "role": teacher["role"],
                "subject_specialization": teacher["subject_specialization"],
                "classes": [a["class_name"] for a in assignments],
            },
            "month_summary": {
                "month": month_start.strftime("%B %Y"),
                "month_key": month_start.strftime("%Y-%m"),
                "working_days": working_days,
                "present": present,
                "late": late,
                "absent": absent,
                "outside_fence": outside,
                "attendance_percent": pct,
                "average_clock_in": avg_clock,
                "average_duration_minutes": avg_duration,
            },
            "records": [
                {
                    "date": r["attendance_date"].isoformat(),
                    "status": r["status"],
                    "clock_in_at": r["clock_in_at"].isoformat() if r["clock_in_at"] else None,
                    "clock_out_at": r["clock_out_at"].isoformat() if r["clock_out_at"] else None,
                    "duration_minutes": r["duration_minutes"],
                    "clock_in_distance_metres": (
                        float(r["clock_in_distance_metres"])
                        if r["clock_in_distance_metres"] is not None
                        else None
                    ),
                    "is_manual": bool(r["is_manual"]),
                    "manual_reason": r["manual_reason"],
                }
                for r in records
            ],
        }
    }


@router.patch("/manual")
async def manual_mark(
    body: ManualMarkBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx
    _require(actor, "manualMarkAttendance", "You cannot manually mark attendance.")
    actor_id = _actor_id(actor)

    teacher = await conn.fetchrow(
        """
        SELECT id, full_name FROM users
        WHERE id = $1 AND school_id = $2 AND lower(role) = 'teacher' AND is_active = true
        """,
        body.teacher_id,
        school_id,
    )
    if not teacher:
        raise HTTPException(
            status_code=404,
            detail={"error": "Teacher not found.", "code": "NOT_FOUND"},
        )

    clock_in_at = None
    clock_out_at = None
    if body.status in ("present", "late") and body.clock_in_time:
        t = _parse_hhmm(body.clock_in_time, "clock_in_time")
        clock_in_at = datetime.combine(body.date, t, tzinfo=LOCAL_TZ)
    if body.clock_out_time:
        t = _parse_hhmm(body.clock_out_time, "clock_out_time")
        clock_out_at = datetime.combine(body.date, t, tzinfo=LOCAL_TZ)

    duration = None
    if clock_in_at and clock_out_at:
        duration = max(0, int((clock_out_at - clock_in_at).total_seconds() // 60))

    await conn.execute(
        """
        INSERT INTO teacher_attendance (
          school_id, teacher_id, attendance_date,
          clock_in_at, clock_out_at, duration_minutes, status,
          is_manual, manual_reason, marked_by, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, NOW())
        ON CONFLICT (school_id, teacher_id, attendance_date)
        DO UPDATE SET
          clock_in_at = EXCLUDED.clock_in_at,
          clock_out_at = EXCLUDED.clock_out_at,
          duration_minutes = EXCLUDED.duration_minutes,
          status = EXCLUDED.status,
          is_manual = true,
          manual_reason = EXCLUDED.manual_reason,
          marked_by = EXCLUDED.marked_by,
          updated_at = NOW()
        """,
        school_id,
        body.teacher_id,
        body.date,
        clock_in_at,
        clock_out_at,
        duration,
        body.status,
        body.reason.strip(),
        actor_id,
    )

    label = f"{body.date.day} {body.date.strftime('%B %Y')}"
    message = (
        f"{teacher['full_name']} has been manually marked as {body.status} for {label}."
    )
    return {"data": {"ok": True}, "message": message}


@router.get("/map-data")
async def map_data(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    on_date: date | None = Query(None, alias="date"),
):
    school_id, actor = ctx
    _require(actor, "viewTeacherAttendance", "You cannot view teacher attendance.")
    target = on_date or datetime.now(LOCAL_TZ).date()
    geo = await _school_geo(conn, school_id)

    rows = await conn.fetch(
        """
        SELECT
          u.id AS teacher_id,
          u.full_name,
          COALESCE(ta.status, 'absent') AS status,
          ta.clock_in_at,
          ta.clock_out_at,
          ta.clock_in_lat,
          ta.clock_in_lng,
          ta.clock_in_distance_metres,
          ta.clock_in_within_fence
        FROM users u
        LEFT JOIN teacher_attendance ta
          ON ta.teacher_id = u.id
          AND ta.school_id = $1
          AND ta.attendance_date = $2
        WHERE u.school_id = $1
          AND lower(u.role) = 'teacher'
          AND u.is_active = true
          AND u.deleted_at IS NULL
        ORDER BY u.full_name ASC
        """,
        school_id,
        target,
    )

    pins = []
    absent = []
    for r in rows:
        if r["clock_in_lat"] is not None and r["clock_in_lng"] is not None:
            pins.append(
                {
                    "teacher_id": str(r["teacher_id"]),
                    "full_name": r["full_name"],
                    "initials": _initials(r["full_name"]),
                    "status": r["status"],
                    "clock_in_at": _fmt_time(r["clock_in_at"]),
                    "clock_out_at": _fmt_time(r["clock_out_at"]),
                    "latitude": float(r["clock_in_lat"]),
                    "longitude": float(r["clock_in_lng"]),
                    "distance_metres": (
                        float(r["clock_in_distance_metres"])
                        if r["clock_in_distance_metres"] is not None
                        else None
                    ),
                    "within_fence": r["clock_in_within_fence"],
                }
            )
        elif r["clock_in_at"] is None:
            absent.append(
                {
                    "teacher_id": str(r["teacher_id"]),
                    "full_name": r["full_name"],
                }
            )

    return {
        "data": {
            "date": target.isoformat(),
            "school_location": {
                "latitude": geo["latitude"],
                "longitude": geo["longitude"],
                "radius_metres": geo["radius_metres"],
                "name": geo["name"],
                "is_configured": geo["is_configured"],
            },
            "pins": pins,
            "absent_teachers": absent,
            "updated_at": datetime.now(LOCAL_TZ).isoformat(),
        }
    }
