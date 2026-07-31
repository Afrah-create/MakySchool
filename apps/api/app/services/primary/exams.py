"""Primary exam types, exams, and teacher mark entry (per-exam grading)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import asyncpg
from fastapi import HTTPException

from app.lib.primary_access import fetch_class_level, is_upper_primary
from app.lib.primary_exam_access import (
    EXAM_SELECT,
    assert_exam_open,
    assert_teacher_can_edit_marks,
    assert_teacher_can_grade_class,
    fetch_exam_subject_rows,
    fetch_teacher_submission,
    list_exam_submissions,
    require_exam,
    resolve_default_exam_subject_ids,
    serialize_exam,
    set_exam_subjects,
    teacher_assigned_primary_class_ids,
)
from app.lib.primary_reports import BULK_MARKS_LIMIT
from app.lib.teacher_assignments import format_class_name
from app.services.primary.recalc import recalculate_exam_results

_UNSET = object()

DEFAULT_EXAM_TYPES = [
    {"name": "Beginning of Term", "code": "BOT", "sort_order": 1},
    {"name": "Mid Term", "code": "MID", "sort_order": 2},
    {"name": "End of Term", "code": "EOT", "sort_order": 3},
]


def serialize_exam_type(row: asyncpg.Record) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "code": row["code"],
        "sortOrder": row["sort_order"],
        "isActive": bool(row["is_active"]),
    }


async def ensure_default_exam_types(
    conn: asyncpg.Connection, school_id: uuid.UUID
) -> list[dict[str, Any]]:
    existing = await conn.fetchval(
        "SELECT COUNT(*)::int FROM primary_exam_types WHERE school_id = $1",
        school_id,
    )
    if not existing:
        for item in DEFAULT_EXAM_TYPES:
            await conn.execute(
                """
                INSERT INTO primary_exam_types (school_id, name, code, sort_order)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (school_id, code) DO NOTHING
                """,
                school_id,
                item["name"],
                item["code"],
                item["sort_order"],
            )
    return await list_exam_types(conn, school_id)


async def list_exam_types(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    active_only: bool = False,
) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT * FROM primary_exam_types
        WHERE school_id = $1
          AND ($2::boolean = false OR is_active = true)
        ORDER BY sort_order, name
        """,
        school_id,
        active_only,
    )
    return [serialize_exam_type(r) for r in rows]


async def create_exam_type(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    name: str,
    code: str,
    sort_order: int = 0,
) -> dict[str, Any]:
    row = await conn.fetchrow(
        """
        INSERT INTO primary_exam_types (school_id, name, code, sort_order)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        """,
        school_id,
        name.strip(),
        code.strip().upper(),
        sort_order,
    )
    return serialize_exam_type(row)


async def update_exam_type(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam_type_id: uuid.UUID,
    payload: dict[str, Any],
) -> dict[str, Any]:
    code = payload.get("code")
    row = await conn.fetchrow(
        """
        UPDATE primary_exam_types SET
          name = COALESCE($3, name),
          code = COALESCE($4, code),
          sort_order = COALESCE($5, sort_order),
          is_active = COALESCE($6, is_active)
        WHERE id = $1 AND school_id = $2
        RETURNING *
        """,
        exam_type_id,
        school_id,
        payload.get("name"),
        code.strip().upper() if isinstance(code, str) else None,
        payload.get("sort_order"),
        payload.get("is_active"),
    )
    if not row:
        raise LookupError("Exam type not found.")
    return serialize_exam_type(row)


async def delete_exam_type(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam_type_id: uuid.UUID,
) -> None:
    in_use = await conn.fetchval(
        """
        SELECT 1 FROM primary_exams
        WHERE school_id = $1 AND exam_type_id = $2
        LIMIT 1
        """,
        school_id,
        exam_type_id,
    )
    if in_use:
        raise ValueError("Cannot delete an exam type that is used by existing exams.")
    result = await conn.execute(
        "DELETE FROM primary_exam_types WHERE id = $1 AND school_id = $2",
        exam_type_id,
        school_id,
    )
    if result == "DELETE 0":
        raise LookupError("Exam type not found.")


async def list_exams(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    class_id: uuid.UUID | None = None,
    term_id: uuid.UUID | None = None,
    status: str | None = None,
    include_deleted: bool = False,
    teacher_id: uuid.UUID | None = None,
) -> list[dict[str, Any]]:
    clauses = ["e.school_id = $1"]
    args: list[Any] = [school_id]
    if not include_deleted:
        clauses.append("e.deleted_at IS NULL")
    if class_id:
        args.append(class_id)
        clauses.append(f"e.class_id = ${len(args)}")
    if term_id:
        args.append(term_id)
        clauses.append(f"e.term_id = ${len(args)}")
    if status:
        args.append(status)
        clauses.append(f"e.status = ${len(args)}")
    if teacher_id:
        assigned = await teacher_assigned_primary_class_ids(conn, school_id, teacher_id)
        if not assigned:
            return []
        args.append(assigned)
        clauses.append(f"e.class_id = ANY(${len(args)}::uuid[])")

    rows = await conn.fetch(
        f"{EXAM_SELECT} WHERE {' AND '.join(clauses)} ORDER BY e.created_at DESC",
        *args,
    )
    exams = [serialize_exam(r) for r in rows]
    if not exams:
        return []
    exam_ids = [uuid.UUID(e["id"]) for e in exams]
    mark_rows = await conn.fetch(
        """
        SELECT exam_id, COUNT(*)::int AS mark_count
        FROM primary_exam_marks
        WHERE school_id = $1 AND exam_id = ANY($2::uuid[])
        GROUP BY exam_id
        """,
        school_id,
        exam_ids,
    )
    mark_map = {str(r["exam_id"]): int(r["mark_count"]) for r in mark_rows}
    subject_rows = await conn.fetch(
        """
        SELECT exam_id, subject_id
        FROM primary_exam_subjects
        WHERE school_id = $1 AND exam_id = ANY($2::uuid[])
        """,
        school_id,
        exam_ids,
    )
    subjects_map: dict[str, list[str]] = {}
    for r in subject_rows:
        subjects_map.setdefault(str(r["exam_id"]), []).append(str(r["subject_id"]))
    for exam in exams:
        exam["hasMarks"] = mark_map.get(exam["id"], 0) > 0
        exam["subjectIds"] = subjects_map.get(exam["id"], [])
    return exams


async def exam_mark_count(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam_id: uuid.UUID,
) -> int:
    return int(
        await conn.fetchval(
            """
            SELECT COUNT(*)::int FROM primary_exam_marks
            WHERE school_id = $1 AND exam_id = $2
            """,
            school_id,
            exam_id,
        )
        or 0
    )


async def _attach_subjects(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam: dict[str, Any],
) -> dict[str, Any]:
    exam_id = uuid.UUID(exam["id"])
    subjects = await fetch_exam_subject_rows(conn, school_id, exam_id)
    exam["subjects"] = [
        {
            "id": str(s["id"]),
            "name": s["name"],
            "code": s["code"],
            "maxMark": float(s["max_mark"]),
            "isPleSubject": bool(s["is_ple_subject"]),
        }
        for s in subjects
    ]
    exam["subjectIds"] = [s["id"] for s in exam["subjects"]]
    exam["hasMarks"] = (await exam_mark_count(conn, school_id, exam_id)) > 0
    return exam


async def create_exam(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor_id: uuid.UUID,
    *,
    class_id: uuid.UUID,
    term_id: uuid.UUID,
    exam_type_id: uuid.UUID,
    name: str | None = None,
    notes: str | None = None,
    open_now: bool = False,
    subject_ids: list[uuid.UUID] | None = None,
) -> dict[str, Any]:
    level = await fetch_class_level(conn, school_id, class_id)
    if not is_upper_primary(level):
        raise ValueError("Subject exams can only be created for P4–P7 classes.")

    term = await conn.fetchrow(
        """
        SELECT id, name, academic_year_id FROM terms
        WHERE id = $1 AND school_id = $2
        """,
        term_id,
        school_id,
    )
    if not term:
        raise LookupError("Term not found.")

    exam_type = await conn.fetchrow(
        """
        SELECT id, name, code FROM primary_exam_types
        WHERE id = $1 AND school_id = $2 AND is_active = true
        """,
        exam_type_id,
        school_id,
    )
    if not exam_type:
        raise LookupError("Exam type not found.")

    class_row = await conn.fetchrow(
        "SELECT level, stream FROM school_classes WHERE id = $1",
        class_id,
    )
    class_name = format_class_name(class_row["level"], class_row["stream"])
    exam_name = (name or "").strip() or f"{exam_type['name']} · {class_name} · {term['name']}"
    status = "open" if open_now else "draft"
    now = datetime.now(timezone.utc) if open_now else None

    resolved = subject_ids
    if not resolved:
        resolved = await resolve_default_exam_subject_ids(
            conn, school_id, class_id=class_id, level=level
        )
    if not resolved:
        raise ValueError(
            "No subjects available for this class. Install default subjects on Primary setup first."
        )

    row = await conn.fetchrow(
        """
        INSERT INTO primary_exams (
          school_id, class_id, term_id, academic_year_id, exam_type_id,
          name, status, opened_at, opened_by, notes
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id
        """,
        school_id,
        class_id,
        term_id,
        term["academic_year_id"],
        exam_type_id,
        exam_name,
        status,
        now,
        actor_id if open_now else None,
        notes,
    )
    exam_id = row["id"]
    await set_exam_subjects(conn, school_id, exam_id, list(resolved))
    exam = await require_exam(conn, school_id, exam_id)
    return await _attach_subjects(conn, school_id, exam)


async def update_exam(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam_id: uuid.UUID,
    *,
    name: str | None = None,
    notes: Any = _UNSET,
    subject_ids: list[uuid.UUID] | None = None,
) -> dict[str, Any]:
    exam = await require_exam(conn, school_id, exam_id)
    if exam.get("deleted"):
        raise ValueError("Cannot edit a deleted exam. Restore it first.")

    sets: list[str] = ["updated_at = NOW()"]
    args: list[Any] = []
    if name is not None:
        trimmed = name.strip()
        if not trimmed:
            raise ValueError("Exam name cannot be empty.")
        args.append(trimmed)
        sets.append(f"name = ${len(args)}")
    if notes is not _UNSET:
        args.append(notes)
        sets.append(f"notes = ${len(args)}")

    if len(args) > 0:
        args.extend([exam_id, school_id])
        await conn.execute(
            f"""
            UPDATE primary_exams SET {', '.join(sets)}
            WHERE id = ${len(args) - 1} AND school_id = ${len(args)}
              AND deleted_at IS NULL
            """,
            *args,
        )

    if subject_ids is not None:
        marks = await exam_mark_count(conn, school_id, exam_id)
        if marks > 0:
            raise ValueError(
                "Cannot change exam subjects after marks have been entered."
            )
        if exam["status"] == "open":
            raise ValueError("Close the exam before changing subjects.")
        await set_exam_subjects(conn, school_id, exam_id, subject_ids)

    updated = await require_exam(conn, school_id, exam_id)
    return await _attach_subjects(conn, school_id, updated)


async def open_exam(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> dict[str, Any]:
    exam = await require_exam(conn, school_id, exam_id)
    if exam["status"] == "open":
        return exam
    await conn.execute(
        """
        UPDATE primary_exams SET
          status = 'open',
          opened_at = NOW(),
          opened_by = $3,
          closed_at = NULL,
          closed_by = NULL,
          updated_at = NOW()
        WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL
        """,
        exam_id,
        school_id,
        actor_id,
    )
    return await require_exam(conn, school_id, exam_id)


async def close_exam(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> dict[str, Any]:
    await require_exam(conn, school_id, exam_id)
    await conn.execute(
        """
        UPDATE primary_exams SET
          status = 'closed',
          closed_at = NOW(),
          closed_by = $3,
          updated_at = NOW()
        WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL
        """,
        exam_id,
        school_id,
        actor_id,
    )
    return await require_exam(conn, school_id, exam_id)


async def soft_delete_exam(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> dict[str, Any]:
    exam = await require_exam(conn, school_id, exam_id)
    if exam["status"] == "open":
        raise HTTPException(
            status_code=409,
            detail={
                "error": "Close the exam before deleting it.",
                "code": "EXAM_OPEN",
            },
        )
    row = await conn.fetchrow(
        """
        UPDATE primary_exams SET
          deleted_at = NOW(),
          deleted_by = $3,
          updated_at = NOW()
        WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL
        RETURNING id, deleted_at
        """,
        exam_id,
        school_id,
        actor_id,
    )
    if not row:
        raise LookupError("Exam not found.")
    return await require_exam(conn, school_id, exam_id, include_deleted=True)


async def restore_exam(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam_id: uuid.UUID,
) -> dict[str, Any]:
    exam = await require_exam(conn, school_id, exam_id, include_deleted=True)
    if not exam.get("deleted"):
        raise ValueError("Exam is not deleted.")

    conflict = await conn.fetchval(
        """
        SELECT 1 FROM primary_exams
        WHERE school_id = $1
          AND class_id = $2
          AND term_id = $3
          AND exam_type_id = $4
          AND deleted_at IS NULL
          AND id <> $5
        LIMIT 1
        """,
        school_id,
        uuid.UUID(exam["classId"]),
        uuid.UUID(exam["termId"]),
        uuid.UUID(exam["examTypeId"]),
        exam_id,
    )
    if conflict:
        raise HTTPException(
            status_code=409,
            detail={
                "error": (
                    "An active exam of this type already exists for this class and term. "
                    "Delete or keep the other exam before restoring."
                ),
                "code": "DUPLICATE",
            },
        )

    await conn.execute(
        """
        UPDATE primary_exams SET
          deleted_at = NULL,
          deleted_by = NULL,
          updated_at = NOW()
        WHERE id = $1 AND school_id = $2
        """,
        exam_id,
        school_id,
    )
    return await require_exam(conn, school_id, exam_id)


async def hard_delete_exam(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam_id: uuid.UUID,
) -> None:
    exam = await require_exam(conn, school_id, exam_id, include_deleted=True)
    if exam["status"] == "open" and not exam.get("deleted"):
        raise HTTPException(
            status_code=409,
            detail={
                "error": "Close the exam before permanently deleting it.",
                "code": "EXAM_OPEN",
            },
        )
    marks = await exam_mark_count(conn, school_id, exam_id)
    if marks > 0:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "This exam has marks. Soft-delete it instead to keep the record.",
                "code": "EXAM_HAS_MARKS",
            },
        )
    result = await conn.execute(
        "DELETE FROM primary_exams WHERE id = $1 AND school_id = $2",
        exam_id,
        school_id,
    )
    if result == "DELETE 0":
        raise LookupError("Exam not found.")


# Back-compat alias — prefer soft_delete_exam.
async def delete_exam(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> dict[str, Any]:
    return await soft_delete_exam(conn, school_id, exam_id, actor_id)


async def get_exam_grades_grid(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam_id: uuid.UUID,
    *,
    teacher_id: uuid.UUID | None = None,
    is_teacher: bool = False,
) -> dict[str, Any]:
    exam = await require_exam(conn, school_id, exam_id)
    class_id = uuid.UUID(exam["classId"])
    level = exam.get("classLevel") or await fetch_class_level(conn, school_id, class_id)

    allowed: set[str] | None = None
    can_edit = False
    submitted = False
    if is_teacher and teacher_id:
        allowed = await assert_teacher_can_grade_class(
            conn, school_id, teacher_id, class_id
        )
        can_edit = exam["status"] == "open"
        sub = await fetch_teacher_submission(conn, school_id, exam_id, teacher_id)
        submitted = sub is not None
        if submitted:
            can_edit = False

    subject_rows = await fetch_exam_subject_rows(conn, school_id, exam_id)
    # Fallback for exams created before migration 050.
    if not subject_rows:
        defaults = await resolve_default_exam_subject_ids(
            conn, school_id, class_id=class_id, level=level
        )
        if defaults:
            await set_exam_subjects(conn, school_id, exam_id, defaults)
            subject_rows = await fetch_exam_subject_rows(conn, school_id, exam_id)

    exam_subject_ids = {str(s["id"]) for s in subject_rows}
    if allowed is not None:
        allowed = allowed & exam_subject_ids
        if not allowed:
            raise PermissionError(
                "None of your assigned subjects are included in this exam. "
                "Ask an admin to add your subjects to the exam or update teaching load."
            )

    subject_list = [
        {
            "id": str(s["id"]),
            "name": s["name"],
            "code": s["code"],
            "maxMark": float(s["max_mark"]),
            "isPleSubject": bool(s["is_ple_subject"]),
        }
        for s in subject_rows
        if allowed is None or str(s["id"]) in allowed
    ]

    students = await conn.fetch(
        """
        SELECT id, full_name, learner_id
        FROM students
        WHERE school_id = $1 AND current_class_id = $2 AND status = 'active'
        ORDER BY full_name
        """,
        school_id,
        class_id,
    )

    marks = await conn.fetch(
        """
        SELECT student_id, subject_id, score, max_score
        FROM primary_exam_marks
        WHERE school_id = $1 AND exam_id = $2
        """,
        school_id,
        exam_id,
    )
    mark_map: dict[tuple[str, str], dict[str, Any]] = {}
    for m in marks:
        mark_map[(str(m["student_id"]), str(m["subject_id"]))] = {
            "score": float(m["score"]) if m["score"] is not None else None,
            "maxScore": float(m["max_score"]),
        }

    results = await conn.fetch(
        """
        SELECT student_id, subject_id, final_percent, grade, grade_label
        FROM primary_subject_results
        WHERE school_id = $1 AND exam_id = $2
        """,
        school_id,
        exam_id,
    )
    result_map: dict[tuple[str, str], dict[str, Any]] = {}
    for r in results:
        result_map[(str(r["student_id"]), str(r["subject_id"]))] = {
            "finalPercent": float(r["final_percent"])
            if r["final_percent"] is not None
            else None,
            "grade": r["grade"],
            "gradeLabel": r["grade_label"],
        }

    grid_students = []
    for st in students:
        sid = str(st["id"])
        scores: dict[str, Any] = {}
        for subj in subject_list:
            key = (sid, subj["id"])
            mark = mark_map.get(key)
            res = result_map.get(key)
            scores[subj["id"]] = {
                "score": mark["score"] if mark else None,
                "maxScore": mark["maxScore"] if mark else subj["maxMark"],
                "finalPercent": res["finalPercent"] if res else None,
                "grade": res["grade"] if res else None,
                "gradeLabel": res["gradeLabel"] if res else None,
            }
        grid_students.append(
            {
                "studentId": sid,
                "fullName": st["full_name"],
                "learnerId": st["learner_id"],
                "scores": scores,
            }
        )

    submissions: list[dict[str, Any]] = []
    if not is_teacher:
        submissions = await list_exam_submissions(conn, school_id, exam_id)

    return {
        "exam": exam,
        "subjects": subject_list,
        "students": grid_students,
        "canEdit": can_edit,
        "submitted": submitted,
        "submissions": submissions,
    }


async def bulk_save_exam_marks(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
    *,
    exam_id: uuid.UUID,
    marks: list[dict[str, Any]],
) -> dict[str, Any]:
    if len(marks) > BULK_MARKS_LIMIT:
        raise ValueError(f"At most {BULK_MARKS_LIMIT} mark rows per request.")

    exam = await assert_exam_open(conn, school_id, exam_id)
    await assert_teacher_can_edit_marks(conn, school_id, exam_id, teacher_id)
    class_id = uuid.UUID(exam["classId"])
    allowed = await assert_teacher_can_grade_class(
        conn, school_id, teacher_id, class_id
    )
    exam_subject_ids = {str(s["id"]) for s in await fetch_exam_subject_rows(conn, school_id, exam_id)}
    allowed = allowed & exam_subject_ids
    if not allowed:
        raise PermissionError(
            "None of your assigned subjects are included in this exam."
        )

    term_id = uuid.UUID(exam["termId"])
    year_id = uuid.UUID(exam["academicYearId"])
    saved = 0
    touched_subjects: set[uuid.UUID] = set()

    for item in marks:
        sid = uuid.UUID(str(item["student_id"]))
        subj = uuid.UUID(str(item["subject_id"]))
        if str(subj) not in allowed:
            raise PermissionError(
                "You cannot enter marks for a subject you do not teach."
            )
        if str(subj) not in exam_subject_ids:
            raise ValueError("This subject is not part of the selected exam.")
        raw_score = item.get("score")
        score = float(raw_score) if raw_score is not None else None
        max_score = float(item.get("max_score") or 100)
        if score is not None and (score < 0 or score > max_score):
            raise ValueError(f"Score must be between 0 and {max_score}.")

        # Skip empty cells that were never saved — keeps bulk payloads small.
        if score is None:
            existing = await conn.fetchval(
                """
                SELECT 1 FROM primary_exam_marks
                WHERE exam_id = $1 AND student_id = $2 AND subject_id = $3
                """,
                exam_id,
                sid,
                subj,
            )
            if not existing:
                continue

        await conn.execute(
            """
            INSERT INTO primary_exam_marks (
              school_id, student_id, class_id, subject_id, exam_id,
              max_score, score, term_id, academic_year_id, recorded_by, exam_type
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL)
            ON CONFLICT (exam_id, student_id, subject_id)
            DO UPDATE SET
              score = EXCLUDED.score,
              max_score = EXCLUDED.max_score,
              recorded_by = EXCLUDED.recorded_by,
              updated_at = NOW()
            """,
            school_id,
            sid,
            class_id,
            subj,
            exam_id,
            max_score,
            score,
            term_id,
            year_id,
            teacher_id,
        )
        saved += 1
        touched_subjects.add(subj)

    # Nested savepoint: grading failure must not roll back saved marks.
    recalc_error: str | None = None
    if touched_subjects:
        try:
            async with conn.transaction():
                for subj in touched_subjects:
                    await recalculate_exam_results(
                        conn,
                        school_id,
                        exam_id=exam_id,
                        subject_id=subj,
                    )
        except Exception as exc:  # noqa: BLE001
            recalc_error = str(exc) or exc.__class__.__name__

    result: dict[str, Any] = {"saved": saved}
    if recalc_error:
        result["recalcWarning"] = (
            "Marks were saved but grading recalculation failed. "
            f"Ensure migration 050 is applied. ({recalc_error})"
        )
    return result


async def submit_exam_marks(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    teacher_id: uuid.UUID,
    exam_id: uuid.UUID,
) -> dict[str, Any]:
    exam = await assert_exam_open(conn, school_id, exam_id)
    class_id = uuid.UUID(exam["classId"])
    allowed = await assert_teacher_can_grade_class(
        conn, school_id, teacher_id, class_id
    )
    exam_subject_ids = {str(s["id"]) for s in await fetch_exam_subject_rows(conn, school_id, exam_id)}
    allowed = allowed & exam_subject_ids
    if not allowed:
        raise PermissionError(
            "None of your assigned subjects are included in this exam."
        )
    existing = await fetch_teacher_submission(conn, school_id, exam_id, teacher_id)
    if existing:
        raise ValueError("Marks already submitted for this exam.")

    count = await conn.fetchval(
        """
        SELECT COUNT(*)::int FROM primary_exam_marks
        WHERE school_id = $1 AND exam_id = $2
          AND subject_id = ANY($3::uuid[])
          AND score IS NOT NULL
        """,
        school_id,
        exam_id,
        [uuid.UUID(s) for s in allowed],
    )
    if not count:
        raise ValueError("Enter at least one score before submitting.")

    await conn.execute(
        """
        INSERT INTO primary_mark_submissions (school_id, exam_id, teacher_id, submitted_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (school_id, exam_id, teacher_id) DO NOTHING
        """,
        school_id,
        exam_id,
        teacher_id,
    )
    try:
        async with conn.transaction():
            await recalculate_exam_results(conn, school_id, exam_id=exam_id)
    except Exception:
        # Submission lock still stands; grades can be recalculated later.
        pass
    return {"submitted": True, "scoresRecorded": count}


async def unlock_teacher_submission(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    exam_id: uuid.UUID,
    teacher_id: uuid.UUID,
) -> dict[str, Any]:
    await require_exam(conn, school_id, exam_id)
    row = await conn.fetchrow(
        """
        DELETE FROM primary_mark_submissions
        WHERE school_id = $1 AND exam_id = $2 AND teacher_id = $3
        RETURNING id
        """,
        school_id,
        exam_id,
        teacher_id,
    )
    if not row:
        raise LookupError("No submission found for this teacher.")
    return {"unlocked": True}
