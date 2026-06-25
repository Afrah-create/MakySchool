import csv
import io
import logging
import re
import uuid
from datetime import date
from typing import Annotated, Any

import asyncpg
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel

from app.db.pool import get_db, get_pool
from app.lib.permissions import can
from app.lib.rate_limit import get_school_key, limiter
from app.lib.sequences import generate_learner_id
from app.lib.teacher_assignments import format_class_name
from app.lib.uploads import ALLOWED_STUDENT_PHOTO_TYPES, save_student_photo
from app.lib.user_sql import USER_DISPLAY_NAME_SQL
from app.middleware.subscription_guard import require_tenant_with_subscription

router = APIRouter()
logger = logging.getLogger("makyschool")

PHONE_RE = re.compile(r"^\+?[0-9\s\-]{7,15}$")
GENDERS = frozenset({"male", "female", "other"})
RELATIONSHIPS = frozenset({"parent", "guardian", "sibling", "other"})
CSV_REQUIRED_HEADERS = ("name", "class", "parent_name")

TenantCtx = Annotated[tuple[uuid.UUID, dict[str, Any]], Depends(require_tenant_with_subscription)]


class PromoteClassBody(BaseModel):
    from_class_id: uuid.UUID
    to_class_id: uuid.UUID
    reason: str = "promotion"


class UpdateStudentBody(BaseModel):
    full_name: str | None = None
    date_of_birth: str | None = None
    gender: str | None = None
    guardian_name: str | None = None
    guardian_phone: str | None = None
    guardian_email: str | None = None
    guardian_relationship: str | None = None


class TransferBody(BaseModel):
    new_class_id: uuid.UUID
    reason: str = "transfer"


class WithdrawBody(BaseModel):
    reason: str | None = None


class ReinstateBody(BaseModel):
    class_id: uuid.UUID


def _serialize_row(row: asyncpg.Record) -> dict[str, Any]:
    data = dict(row)
    for key, value in data.items():
        if isinstance(value, uuid.UUID):
            data[key] = str(value)
    return data


def _age_from_dob(dob: date) -> int:
    today = date.today()
    age = today.year - dob.year
    if (today.month, today.day) < (dob.month, dob.day):
        age -= 1
    return age


def _normalize_gender(value: str | None) -> str | None:
    if not value or not value.strip():
        return None
    raw = value.strip().lower()
    if raw in ("m", "male"):
        return "male"
    if raw in ("f", "female"):
        return "female"
    if raw == "other":
        return "other"
    return None


def _normalize_relationship(value: str | None) -> str:
    raw = (value or "parent").strip().lower()
    return raw if raw in RELATIONSHIPS else "parent"


def _parse_optional_date(value: str | date | None) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


async def _load_class_map(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
) -> tuple[dict[str, dict[str, Any]], dict[str, str]]:
    rows = await conn.fetch(
        "SELECT id, level, stream FROM school_classes WHERE school_id = $1",
        school_id,
    )

    by_id: dict[str, dict[str, Any]] = {}
    by_name: dict[str, str] = {}

    for row in rows:
        name = format_class_name(row["level"], row["stream"])
        class_id = str(row["id"])
        by_id[class_id] = {
            "id": class_id,
            "level": row["level"],
            "stream": row["stream"],
            "name": name,
        }
        by_name[name.lower()] = class_id
        by_name[row["level"].lower()] = class_id

    return by_id, by_name


async def _validate_student_fields(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    data: dict[str, Any],
    *,
    require_class: bool = False,
    require_guardian: bool = False,
    require_name: bool = False,
) -> dict[str, str]:
    fields: dict[str, str] = {}

    if require_name or data.get("full_name") is not None:
        name = (data.get("full_name") or "").strip()
        if not name:
            fields["full_name"] = "Full name is required."
        elif len(name) < 2:
            fields["full_name"] = "Full name must be at least 2 characters."
        elif len(name) > 100:
            fields["full_name"] = "Full name must be under 100 characters."

    dob_raw = data.get("date_of_birth")
    if dob_raw is not None and dob_raw:
        try:
            dob = date.fromisoformat(str(dob_raw)[:10])
        except ValueError:
            fields["date_of_birth"] = "Enter a valid date of birth."
        else:
            if dob > date.today():
                fields["date_of_birth"] = "Date of birth cannot be in the future."
            else:
                age = _age_from_dob(dob)
                if age < 2:
                    fields["date_of_birth"] = "Student must be at least 2 years old."
                elif age > 25:
                    fields["date_of_birth"] = "Student cannot be older than 25 years."

    gender = data.get("gender")
    if gender is not None and gender != "" and gender not in GENDERS:
        fields["gender"] = "Gender must be male, female, or other."

    class_id = data.get("class_id")
    if require_class or class_id is not None:
        if not class_id:
            fields["class_id"] = "Please select a class."
        else:
            exists = await conn.fetchval(
                "SELECT 1 FROM school_classes WHERE id = $1 AND school_id = $2 LIMIT 1",
                uuid.UUID(str(class_id)),
                school_id,
            )
            if not exists:
                fields["class_id"] = "The selected class does not exist in your school."

    if require_guardian or data.get("guardian_name") is not None:
        guardian_name = (data.get("guardian_name") or "").strip()
        if not guardian_name:
            fields["guardian_name"] = "Guardian name is required."
        elif len(guardian_name) < 2:
            fields["guardian_name"] = "Guardian name must be at least 2 characters."
        elif len(guardian_name) > 100:
            fields["guardian_name"] = "Guardian name must be under 100 characters."

    guardian_phone = data.get("guardian_phone")
    if guardian_phone is not None and str(guardian_phone).strip():
        if not PHONE_RE.match(str(guardian_phone).strip()):
            fields["guardian_phone"] = "Enter a valid phone number."

    relationship = data.get("guardian_relationship")
    if (
        relationship is not None
        and relationship != ""
        and relationship not in RELATIONSHIPS
    ):
        fields["guardian_relationship"] = (
            "Relationship must be parent, guardian, sibling, or other."
        )

    return fields


async def _fetch_student_detail(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    student_id: uuid.UUID,
) -> dict[str, Any] | None:
    creator_sql = USER_DISPLAY_NAME_SQL.replace("u.", "creator.")
    student = await conn.fetchrow(
        f"""
        SELECT
          s.*,
          sc.level,
          sc.stream,
          sc.id AS class_id,
          {creator_sql} AS created_by_name
        FROM students s
        LEFT JOIN school_classes sc ON sc.id = s.current_class_id
        LEFT JOIN users creator ON creator.id = s.created_by
        WHERE s.id = $1 AND s.school_id = $2
        LIMIT 1
        """,
        student_id,
        school_id,
    )
    if not student:
        return None

    guardian = await conn.fetchrow(
        """
        SELECT id, full_name, phone, email, relationship, is_primary
        FROM student_guardians
        WHERE student_id = $1 AND school_id = $2 AND is_primary = true
        LIMIT 1
        """,
        student_id,
        school_id,
    )

    history_rows = await conn.fetch(
        """
        SELECT
          h.id,
          h.class_id,
          h.enrolled_at,
          h.left_at,
          h.reason,
          sc.level,
          sc.stream
        FROM student_class_history h
        JOIN school_classes sc ON sc.id = h.class_id
        WHERE h.student_id = $1 AND h.school_id = $2
        ORDER BY h.enrolled_at DESC
        """,
        student_id,
        school_id,
    )

    class_name = (
        format_class_name(student["level"], student["stream"]) if student["level"] else None
    )

    return {
        "id": str(student["id"]),
        "learner_id": student["learner_id"],
        "full_name": student["full_name"],
        "date_of_birth": student["date_of_birth"],
        "gender": student["gender"],
        "photo_url": student["photo_url"],
        "status": student["status"],
        "current_class_id": str(student["current_class_id"]) if student["current_class_id"] else None,
        "class_id": str(student["class_id"]) if student["class_id"] else None,
        "class_name": class_name,
        "withdrawal_reason": student["withdrawal_reason"],
        "withdrawn_at": student["withdrawn_at"],
        "created_at": student["created_at"],
        "updated_at": student["updated_at"],
        "created_by": str(student["created_by"]) if student["created_by"] else None,
        "created_by_name": student["created_by_name"],
        "guardian": _serialize_row(guardian) if guardian else None,
        "class_history": [
            {
                "id": str(row["id"]),
                "class_id": str(row["class_id"]),
                "class_name": format_class_name(row["level"], row["stream"]),
                "enrolled_at": row["enrolled_at"],
                "left_at": row["left_at"],
                "reason": row["reason"],
            }
            for row in history_rows
        ],
        "fee_history": [],
        "results": [],
    }


def _map_list_row(row: asyncpg.Record) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "learner_id": row["learner_id"],
        "full_name": row["full_name"],
        "date_of_birth": row["date_of_birth"],
        "gender": row["gender"],
        "photo_url": row["photo_url"],
        "status": row["status"],
        "created_at": row["created_at"],
        "class_id": str(row["class_id"]) if row["class_id"] else None,
        "class_name": row["class_name"],
        "guardian_name": row["guardian_name"],
        "guardian_phone": row["guardian_phone"],
    }


@router.get("/import/template")
async def download_import_template(ctx: TenantCtx):
    _school_id, _actor = ctx
    csv_content = "\n".join(
        [
            "name,dob,gender,class,parent_name,parent_phone,parent_email",
            "John Doe,2015-03-12,male,P3A,James Doe,+256701234567,james@email.com",
            "Jane Smith,2014-07-20,female,P3A,Grace Smith,+256702345678,",
        ]
    )
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="student_import_template.csv"'},
    )


@router.post("/import", status_code=status.HTTP_201_CREATED)
@limiter.limit("2/minute", key_func=get_school_key)
async def import_students(
    request: Request,
    ctx: TenantCtx,
    file: UploadFile = File(...),
):
    school_id, actor = ctx

    if not can(actor["role"], "manageStaff"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "You do not have permission to import students.",
                "code": "FORBIDDEN",
            },
        )

    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "Please upload a CSV file.",
                "code": "VALIDATION_ERROR",
                "fields": {"file": "A CSV file is required."},
            },
        )

    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "CSV file is too large.", "code": "VALIDATION_ERROR"},
        )

    try:
        text = raw.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames:
            raise ValueError("empty")
        reader.fieldnames = [h.strip().lower() for h in reader.fieldnames]
        records = list(reader)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "Could not parse the CSV file.", "code": "VALIDATION_ERROR"},
        )

    headers = list(records[0].keys()) if records else []
    missing_headers = [h for h in CSV_REQUIRED_HEADERS if h not in headers]
    if missing_headers:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": f"CSV is missing required columns: {', '.join(missing_headers)}",
                "code": "VALIDATION_ERROR",
            },
        )

    pool = await get_pool()
    async with pool.acquire() as conn:
        _by_id, by_name = await _load_class_map(conn, school_id)

    row_errors: list[dict[str, Any]] = []
    valid_rows: list[dict[str, Any]] = []

    for index, record in enumerate(records):
        row_num = index + 2
        name = (record.get("name") or "").strip()
        class_label = (record.get("class") or "").strip()
        parent_name = (record.get("parent_name") or "").strip()
        dob_raw = (record.get("dob") or "").strip()
        gender_raw = (record.get("gender") or "").strip()
        parent_phone = (record.get("parent_phone") or "").strip()
        parent_email = (record.get("parent_email") or "").strip()
        relationship_raw = (record.get("guardian_relationship") or "").strip()

        if not name:
            row_errors.append({"row": row_num, "field": "name", "message": f"Row {row_num} is missing a student name."})
        elif len(name) < 2 or len(name) > 100:
            row_errors.append({"row": row_num, "field": "name", "message": f"Row {row_num} has an invalid name."})

        class_id: str | None = None
        if not class_label:
            row_errors.append({"row": row_num, "field": "class", "message": f"Row {row_num} is missing a class."})
        else:
            class_id = by_name.get(class_label.lower())
            if not class_id:
                row_errors.append({
                    "row": row_num,
                    "field": "class",
                    "message": f'Row {row_num}: class "{class_label}" was not found in your school.',
                })

        if not parent_name:
            row_errors.append({
                "row": row_num,
                "field": "parent_name",
                "message": f"Row {row_num} is missing a parent name.",
            })
        elif len(parent_name) < 2 or len(parent_name) > 100:
            row_errors.append({
                "row": row_num,
                "field": "parent_name",
                "message": f"Row {row_num} has an invalid parent name.",
            })

        date_of_birth: date | None = None
        if dob_raw:
            try:
                date_of_birth = date.fromisoformat(dob_raw[:10])
            except ValueError:
                row_errors.append({
                    "row": row_num,
                    "field": "dob",
                    "message": f"Row {row_num} has an invalid date of birth.",
                })

        gender = _normalize_gender(gender_raw)
        if gender_raw and not gender:
            row_errors.append({
                "row": row_num,
                "field": "gender",
                "message": f"Row {row_num} has an invalid gender.",
            })

        if parent_phone and not PHONE_RE.match(parent_phone):
            row_errors.append({
                "row": row_num,
                "field": "parent_phone",
                "message": f"Row {row_num} has an invalid phone number.",
            })

        if any(err["row"] == row_num for err in row_errors):
            continue

        valid_rows.append({
            "full_name": name,
            "date_of_birth": date_of_birth,
            "gender": gender,
            "class_id": uuid.UUID(class_id),
            "guardian_name": parent_name,
            "guardian_phone": parent_phone or None,
            "guardian_email": parent_email or None,
            "guardian_relationship": _normalize_relationship(relationship_raw),
        })

    if row_errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "Validation failed. Fix the errors below and re-upload.",
                "code": "IMPORT_VALIDATION_FAILED",
                "row_errors": row_errors,
                "summary": (
                    f"{len(row_errors)} of {len(records)} rows have errors. "
                    "No students were imported."
                ),
            },
        )

    if not valid_rows:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "The CSV file contains no student rows.", "code": "VALIDATION_ERROR"},
        )

    import_id = uuid.uuid4()
    actor_id = uuid.UUID(str(actor["sub"]))

    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(
                    """
                    INSERT INTO student_import_logs (
                      id, school_id, imported_by, filename, total_rows, status
                    ) VALUES ($1, $2, $3, $4, $5, 'pending')
                    """,
                    import_id,
                    school_id,
                    actor_id,
                    file.filename,
                    len(valid_rows),
                )

                for row in valid_rows:
                    student_id = uuid.uuid4()
                    learner_id = await generate_learner_id(conn, school_id)

                    await conn.execute(
                        """
                        INSERT INTO students (
                          id, school_id, learner_id, full_name, date_of_birth, gender,
                          current_class_id, status, created_by, created_at, updated_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, NOW(), NOW())
                        """,
                        student_id,
                        school_id,
                        learner_id,
                        row["full_name"],
                        row["date_of_birth"],
                        row["gender"],
                        row["class_id"],
                        actor_id,
                    )

                    await conn.execute(
                        """
                        INSERT INTO student_guardians (
                          id, school_id, student_id, full_name, phone, email,
                          relationship, is_primary
                        ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true)
                        """,
                        school_id,
                        student_id,
                        row["guardian_name"],
                        row["guardian_phone"],
                        row["guardian_email"],
                        row["guardian_relationship"],
                    )

                    await conn.execute(
                        """
                        INSERT INTO student_class_history (
                          id, school_id, student_id, class_id, enrolled_at, reason, moved_by
                        ) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), 'initial_enrollment', $4)
                        """,
                        school_id,
                        student_id,
                        row["class_id"],
                        actor_id,
                    )

                await conn.execute(
                    """
                    UPDATE student_import_logs
                    SET imported = $1, failed = 0, status = 'complete', errors = '[]'::jsonb
                    WHERE id = $2
                    """,
                    len(valid_rows),
                    import_id,
                )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "Something went wrong. Please try again.",
                "code": "SERVER_ERROR",
            },
        )

    return {
        "data": {
            "message": f"{len(valid_rows)} students imported successfully.",
            "imported": len(valid_rows),
            "import_id": str(import_id),
        }
    }


@router.post("/promote-class")
async def promote_class(
    body: PromoteClassBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx

    if not can(actor["role"], "manageStaff"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "You do not have permission to promote students.",
                "code": "FORBIDDEN",
            },
        )

    if body.from_class_id == body.to_class_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "From and to classes must be different.",
                "code": "VALIDATION_ERROR",
            },
        )

    by_id, _by_name = await _load_class_map(conn, school_id)
    from_class = by_id.get(str(body.from_class_id))
    to_class = by_id.get(str(body.to_class_id))

    if not from_class or not to_class:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "One or both classes were not found in your school.",
                "code": "VALIDATION_ERROR",
            },
        )

    active_students = await conn.fetch(
        """
        SELECT id, full_name FROM students
        WHERE school_id = $1 AND current_class_id = $2 AND status = 'active'
        """,
        school_id,
        body.from_class_id,
    )

    if not active_students:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "No active students found in this class.", "code": "NOT_FOUND"},
        )

    actor_id = uuid.UUID(str(actor["sub"]))

    try:
        async with conn.transaction():
            for student in active_students:
                await conn.execute(
                    """
                    UPDATE student_class_history
                    SET left_at = NOW(), reason = $1
                    WHERE student_id = $2 AND school_id = $3 AND left_at IS NULL
                    """,
                    body.reason,
                    student["id"],
                    school_id,
                )
                await conn.execute(
                    """
                    UPDATE students
                    SET current_class_id = $1, updated_at = NOW()
                    WHERE id = $2 AND school_id = $3
                    """,
                    body.to_class_id,
                    student["id"],
                    school_id,
                )
                await conn.execute(
                    """
                    INSERT INTO student_class_history (
                      id, school_id, student_id, class_id, enrolled_at, reason, moved_by
                    ) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), $4, $5)
                    """,
                    school_id,
                    student["id"],
                    body.to_class_id,
                    body.reason,
                    actor_id,
                )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "Something went wrong. Please try again.",
                "code": "SERVER_ERROR",
            },
        )

    return {
        "data": {
            "message": (
                f"{len(active_students)} students have been promoted from "
                f"{from_class['name']} to {to_class['name']}."
            ),
            "count": len(active_students),
        }
    }


@router.get("")
async def list_students(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    search: str | None = Query(None),
    class_id: uuid.UUID | None = Query(None, alias="class_id"),
    gender: str | None = Query(None),
    status_filter: str = Query("active", alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
):
    school_id, _actor = ctx
    offset = (page - 1) * limit

    conditions = ["s.school_id = $1", "s.status = $2"]
    params: list[Any] = [school_id, status_filter]
    param_index = 3

    if class_id:
        conditions.append(f"s.current_class_id = ${param_index}")
        params.append(class_id)
        param_index += 1

    if gender and gender in GENDERS:
        conditions.append(f"s.gender = ${param_index}")
        params.append(gender)
        param_index += 1

    if search and search.strip():
        conditions.append(
            f"(s.full_name ILIKE ${param_index} OR s.learner_id ILIKE ${param_index})"
        )
        params.append(f"%{search.strip()}%")
        param_index += 1

    where_clause = " AND ".join(conditions)
    total = await conn.fetchval(
        f"SELECT COUNT(*)::int FROM students s WHERE {where_clause}",
        *params,
    )

    list_params = [*params, limit, offset]
    rows = await conn.fetch(
        f"""
        SELECT
          s.id,
          s.learner_id,
          s.full_name,
          s.date_of_birth,
          s.gender,
          s.photo_url,
          s.status,
          s.created_at,
          sc.level || COALESCE(sc.stream, '') AS class_name,
          sc.id AS class_id,
          sg.full_name AS guardian_name,
          sg.phone AS guardian_phone
        FROM students s
        LEFT JOIN school_classes sc ON sc.id = s.current_class_id
        LEFT JOIN student_guardians sg ON sg.student_id = s.id AND sg.is_primary = true
        WHERE {where_clause}
        ORDER BY s.full_name ASC
        LIMIT ${param_index} OFFSET ${param_index + 1}
        """,
        *list_params,
    )

    return {
        "data": {
            "students": [_map_list_row(row) for row in rows],
            "total": int(total or 0),
            "page": page,
            "limit": limit,
        }
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_student(
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
    full_name: str = Form(...),
    class_id: uuid.UUID = Form(...),
    guardian_name: str = Form(...),
    date_of_birth: str | None = Form(None),
    gender: str | None = Form(None),
    guardian_phone: str | None = Form(None),
    guardian_email: str | None = Form(None),
    guardian_relationship: str | None = Form("parent"),
    photo: UploadFile | None = File(None),
):
    school_id, actor = ctx

    if not can(actor["role"], "manageStaff"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "You do not have permission to register students.",
                "code": "FORBIDDEN",
            },
        )

    input_data = {
        "full_name": full_name,
        "date_of_birth": date_of_birth or None,
        "gender": gender or None,
        "class_id": str(class_id),
        "guardian_name": guardian_name,
        "guardian_phone": guardian_phone or None,
        "guardian_email": guardian_email or None,
        "guardian_relationship": guardian_relationship or "parent",
    }

    fields = await _validate_student_fields(
        conn,
        school_id,
        input_data,
        require_name=True,
        require_class=True,
        require_guardian=True,
    )

    photo_buffer: bytes | None = None
    photo_mimetype: str | None = None
    if photo and photo.filename:
        photo_mimetype = photo.content_type or ""
        if photo_mimetype not in ALLOWED_STUDENT_PHOTO_TYPES:
            fields["photo"] = "Photo must be a JPEG, PNG, or WebP image."
        else:
            photo_buffer = await photo.read()
            if len(photo_buffer) > 2 * 1024 * 1024:
                fields["photo"] = "Photo must be under 2 MB."

    if fields:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "Please fix the highlighted fields and try again.",
                "code": "VALIDATION_ERROR",
                "fields": fields,
            },
        )

    student_id = uuid.uuid4()
    actor_id = uuid.UUID(str(actor["sub"]))
    parsed_dob = _parse_optional_date(date_of_birth)

    try:
        async with conn.transaction():
            learner_id = await generate_learner_id(conn, school_id)

            photo_url: str | None = None
            if photo_buffer and photo_mimetype:
                photo_url = await save_student_photo(
                    str(school_id),
                    str(student_id),
                    photo_buffer,
                    photo_mimetype,
                )

            await conn.execute(
                """
                INSERT INTO students (
                  id, school_id, learner_id, full_name, date_of_birth, gender, photo_url,
                  current_class_id, status, created_by, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, NOW(), NOW())
                """,
                student_id,
                school_id,
                learner_id,
                full_name.strip(),
                parsed_dob,
                gender or None,
                photo_url,
                class_id,
                actor_id,
            )

            await conn.execute(
                """
                INSERT INTO student_guardians (
                  id, school_id, student_id, full_name, phone, email, relationship, is_primary
                ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true)
                """,
                school_id,
                student_id,
                guardian_name.strip(),
                guardian_phone.strip() if guardian_phone else None,
                guardian_email.strip() if guardian_email else None,
                _normalize_relationship(guardian_relationship),
            )

            await conn.execute(
                """
                INSERT INTO student_class_history (
                  id, school_id, student_id, class_id, enrolled_at, reason, moved_by
                ) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), 'initial_enrollment', $4)
                """,
                school_id,
                student_id,
                class_id,
                actor_id,
            )
    except Exception as exc:
        logger.exception("create_student failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "Something went wrong. Please try again.",
                "code": "SERVER_ERROR",
            },
        )

    by_id, _ = await _load_class_map(conn, school_id)
    class_info = by_id.get(str(class_id))

    return {
        "data": {
            "student": {
                "id": str(student_id),
                "learner_id": learner_id,
                "full_name": full_name.strip(),
                "class_name": class_info["name"] if class_info else None,
                "guardian_name": guardian_name.strip(),
                "guardian_phone": guardian_phone.strip() if guardian_phone else None,
            }
        }
    }


@router.get("/{student_id}")
async def get_student(
    student_id: uuid.UUID,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, _actor = ctx

    student = await _fetch_student_detail(conn, school_id, student_id)
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "Student not found in your school.", "code": "NOT_FOUND"},
        )

    return {"data": student}


@router.patch("/{student_id}")
async def update_student(
    student_id: uuid.UUID,
    request: Request,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx

    raw_body = await request.json()
    if "class_id" in raw_body:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "Use the class transfer endpoint to move a student to a different class.",
                "code": "VALIDATION_ERROR",
            },
        )

    body = UpdateStudentBody(**raw_body)

    if not can(actor["role"], "manageStaff"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "You do not have permission to update students.",
                "code": "FORBIDDEN",
            },
        )

    fields = await _validate_student_fields(
        conn,
        school_id,
        body.model_dump(exclude_unset=True),
    )
    if fields:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "Please fix the highlighted fields and try again.",
                "code": "VALIDATION_ERROR",
                "fields": fields,
            },
        )

    existing = await conn.fetchval(
        "SELECT id FROM students WHERE id = $1 AND school_id = $2 LIMIT 1",
        student_id,
        school_id,
    )
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "Student not found in your school.", "code": "NOT_FOUND"},
        )

    updates: list[str] = []
    params: list[Any] = []
    index = 1

    if body.full_name is not None:
        updates.append(f"full_name = ${index}")
        params.append(body.full_name.strip())
        index += 1
    if body.date_of_birth is not None:
        updates.append(f"date_of_birth = ${index}")
        params.append(_parse_optional_date(body.date_of_birth))
        index += 1
    if body.gender is not None:
        updates.append(f"gender = ${index}")
        params.append(body.gender or None)
        index += 1

    if updates:
        updates.append("updated_at = NOW()")
        params.extend([student_id, school_id])
        await conn.execute(
            f"UPDATE students SET {', '.join(updates)} WHERE id = ${index} AND school_id = ${index + 1}",
            *params,
        )

    if any(
        v is not None
        for v in (
            body.guardian_name,
            body.guardian_phone,
            body.guardian_email,
            body.guardian_relationship,
        )
    ):
        await conn.execute(
            """
            UPDATE student_guardians
            SET full_name = COALESCE($1, full_name),
                phone = COALESCE($2, phone),
                email = COALESCE($3, email),
                relationship = COALESCE($4, relationship)
            WHERE student_id = $5 AND school_id = $6 AND is_primary = true
            """,
            body.guardian_name.strip() if body.guardian_name else None,
            body.guardian_phone.strip() if body.guardian_phone else None,
            body.guardian_email.strip() if body.guardian_email else None,
            _normalize_relationship(body.guardian_relationship)
            if body.guardian_relationship
            else None,
            student_id,
            school_id,
        )

    student = await _fetch_student_detail(conn, school_id, student_id)
    return {"data": student}


@router.patch("/{student_id}/transfer")
async def transfer_student(
    student_id: uuid.UUID,
    body: TransferBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx

    if not can(actor["role"], "manageStaff"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "You do not have permission to transfer students.",
                "code": "FORBIDDEN",
            },
        )

    student = await conn.fetchrow(
        """
        SELECT s.id, s.full_name, s.current_class_id, sc.level, sc.stream
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
            detail={"error": "Student not found in your school.", "code": "NOT_FOUND"},
        )

    if student["current_class_id"] == body.new_class_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "Student is already in this class.", "code": "CONFLICT"},
        )

    by_id, _ = await _load_class_map(conn, school_id)
    new_class = by_id.get(str(body.new_class_id))
    if not new_class:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "The selected class does not exist in your school.",
                "code": "VALIDATION_ERROR",
            },
        )

    actor_id = uuid.UUID(str(actor["sub"]))

    try:
        async with conn.transaction():
            await conn.execute(
                """
                UPDATE student_class_history
                SET left_at = NOW(), reason = $1
                WHERE student_id = $2 AND school_id = $3 AND left_at IS NULL
                """,
                body.reason,
                student_id,
                school_id,
            )
            await conn.execute(
                """
                UPDATE students
                SET current_class_id = $1, updated_at = NOW()
                WHERE id = $2 AND school_id = $3
                """,
                body.new_class_id,
                student_id,
                school_id,
            )
            await conn.execute(
                """
                INSERT INTO student_class_history (
                  id, school_id, student_id, class_id, enrolled_at, reason, moved_by
                ) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), $4, $5)
                """,
                school_id,
                student_id,
                body.new_class_id,
                body.reason,
                actor_id,
            )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "Something went wrong. Please try again.",
                "code": "SERVER_ERROR",
            },
        )

    updated = await _fetch_student_detail(conn, school_id, student_id)
    return {
        "data": {
            "message": f"{student['full_name']} has been moved to {new_class['name']}.",
            "student": updated,
        }
    }


@router.patch("/{student_id}/withdraw")
async def withdraw_student(
    student_id: uuid.UUID,
    body: WithdrawBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx

    if not can(actor["role"], "manageStaff"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "You do not have permission to withdraw students.",
                "code": "FORBIDDEN",
            },
        )

    student = await conn.fetchrow(
        "SELECT id, full_name, status FROM students WHERE id = $1 AND school_id = $2",
        student_id,
        school_id,
    )
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "Student not found in your school.", "code": "NOT_FOUND"},
        )

    if student["status"] == "withdrawn":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "This student has already been withdrawn.",
                "code": "ALREADY_WITHDRAWN",
            },
        )

    try:
        async with conn.transaction():
            await conn.execute(
                """
                UPDATE students
                SET status = 'withdrawn',
                    withdrawn_at = NOW(),
                    withdrawal_reason = $1,
                    updated_at = NOW()
                WHERE id = $2 AND school_id = $3
                """,
                body.reason.strip() if body.reason else None,
                student_id,
                school_id,
            )
            await conn.execute(
                """
                UPDATE student_class_history
                SET left_at = NOW(), reason = 'withdrawal'
                WHERE student_id = $1 AND school_id = $2 AND left_at IS NULL
                """,
                student_id,
                school_id,
            )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "Something went wrong. Please try again.",
                "code": "SERVER_ERROR",
            },
        )

    updated = await _fetch_student_detail(conn, school_id, student_id)
    return {
        "data": {
            "message": (
                f"{student['full_name']} has been withdrawn. Their records are preserved."
            ),
            "student": updated,
        }
    }


@router.patch("/{student_id}/reinstate")
async def reinstate_student(
    student_id: uuid.UUID,
    body: ReinstateBody,
    ctx: TenantCtx,
    conn: asyncpg.Connection = Depends(get_db),
):
    school_id, actor = ctx

    if not can(actor["role"], "manageStaff"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "You do not have permission to reinstate students.",
                "code": "FORBIDDEN",
            },
        )

    class_exists = await conn.fetchval(
        "SELECT 1 FROM school_classes WHERE id = $1 AND school_id = $2 LIMIT 1",
        body.class_id,
        school_id,
    )
    if not class_exists:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "The selected class does not exist in your school.",
                "code": "VALIDATION_ERROR",
            },
        )

    student = await conn.fetchrow(
        "SELECT id, full_name, status FROM students WHERE id = $1 AND school_id = $2",
        student_id,
        school_id,
    )
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "Student not found in your school.", "code": "NOT_FOUND"},
        )

    if student["status"] == "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "This student is already active.", "code": "ALREADY_ACTIVE"},
        )

    actor_id = uuid.UUID(str(actor["sub"]))

    try:
        async with conn.transaction():
            await conn.execute(
                """
                UPDATE students
                SET status = 'active',
                    withdrawn_at = NULL,
                    withdrawal_reason = NULL,
                    current_class_id = $1,
                    updated_at = NOW()
                WHERE id = $2 AND school_id = $3
                """,
                body.class_id,
                student_id,
                school_id,
            )
            await conn.execute(
                """
                INSERT INTO student_class_history (
                  id, school_id, student_id, class_id, enrolled_at, reason, moved_by
                ) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), 'reinstatement', $4)
                """,
                school_id,
                student_id,
                body.class_id,
                actor_id,
            )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "Something went wrong. Please try again.",
                "code": "SERVER_ERROR",
            },
        )

    updated = await _fetch_student_detail(conn, school_id, student_id)
    return {
        "data": {
            "message": f"{student['full_name']} has been reinstated.",
            "student": updated,
        }
    }
