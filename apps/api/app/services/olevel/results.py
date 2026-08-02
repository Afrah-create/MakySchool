from __future__ import annotations

import uuid
from typing import Any

import asyncpg

from . import serialize


async def class_results(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    class_id: uuid.UUID,
    term_id: uuid.UUID,
    academic_year_id: uuid.UUID,
) -> dict[str, Any]:
    rows = await conn.fetch(
        """
        SELECT r.*, s.full_name AS student_name, s.learner_id, e.id AS enrollment_id
        FROM olevel_student_results r
        JOIN student_curriculum_enrollments e ON e.id = r.enrollment_id
        JOIN students s ON s.id = e.student_id
        WHERE r.school_id = $1
          AND e.class_id = $2
          AND r.term_id = $3
          AND r.academic_year_id = $4
        ORDER BY r.class_position NULLS LAST, s.full_name
        """,
        school_id,
        class_id,
        term_id,
        academic_year_id,
    )
    enrollment_ids = [r["enrollment_id"] for r in rows]
    subject_rows = (
        await conn.fetch(
            """
            SELECT sr.*, os.name AS subject_name, os.code AS subject_code
            FROM olevel_subject_results sr
            JOIN olevel_subjects os ON os.id = sr.subject_id
            WHERE sr.enrollment_id = ANY ($1::uuid[])
              AND sr.term_id = $2
              AND sr.academic_year_id = $3
            ORDER BY os.name
            """,
            enrollment_ids,
            term_id,
            academic_year_id,
        )
        if enrollment_ids
        else []
    )
    by_enrollment: dict[uuid.UUID, list[Any]] = {}
    for sr in subject_rows:
        by_enrollment.setdefault(sr["enrollment_id"], []).append(sr)

    items = []
    for r in rows:
        item = serialize.student_result(r)
        item["subjectResults"] = [
            serialize.subject_result(x)
            for x in by_enrollment.get(r["enrollment_id"], [])
        ]
        items.append(item)

    approved = sum(1 for x in items if x.get("approvedAt"))
    promoted = sum(1 for x in items if x.get("isPromoted") is True)
    avg = (
        round(sum(float(x.get("averagePercent") or 0) for x in items) / len(items), 1)
        if items
        else 0.0
    )
    return {
        "classId": str(class_id),
        "termId": str(term_id),
        "academicYearId": str(academic_year_id),
        "students": items,
        "summary": {
            "studentCount": len(items),
            "approvedCount": approved,
            "promotedCount": promoted,
            "averagePercent": avg,
            "rankedCount": sum(1 for x in items if x.get("classPosition")),
        },
    }


async def student_results(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    enrollment_id: uuid.UUID,
) -> dict[str, Any]:
    e = await conn.fetchrow(
        """
        SELECT e.*, s.full_name, s.learner_id
        FROM student_curriculum_enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE e.id = $1 AND e.school_id = $2
        """,
        enrollment_id,
        school_id,
    )
    if not e:
        raise LookupError("Enrollment not found.")
    rows = await conn.fetch(
        """
        SELECT * FROM olevel_student_results
        WHERE school_id = $1 AND enrollment_id = $2
        ORDER BY academic_year_id, term_id
        """,
        school_id,
        enrollment_id,
    )
    return {
        "enrollment": serialize.enrollment(e),
        "results": [serialize.student_result(x) for x in rows],
    }


async def save_comments(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    enrollment_id: uuid.UUID,
    term_id: uuid.UUID,
    academic_year_id: uuid.UUID,
    class_teacher_comment: str | None = None,
    head_teacher_comment: str | None = None,
) -> dict[str, Any]:
    await conn.execute(
        """
        UPDATE olevel_student_results
        SET class_teacher_comment = COALESCE($5, class_teacher_comment),
            head_teacher_comment = COALESCE($6, head_teacher_comment)
        WHERE school_id = $1
          AND enrollment_id = $2
          AND term_id = $3
          AND academic_year_id = $4
        """,
        school_id,
        enrollment_id,
        term_id,
        academic_year_id,
        class_teacher_comment,
        head_teacher_comment,
    )
    return {"saved": True}


async def save_comments_bulk(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    enrollment_ids: list[uuid.UUID],
    term_id: uuid.UUID,
    academic_year_id: uuid.UUID,
    class_teacher_comment: str | None = None,
    head_teacher_comment: str | None = None,
    approve: bool = False,
    actor_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    if not enrollment_ids:
        return {"saved": 0, "approved": 0}
    await conn.execute(
        """
        UPDATE olevel_student_results
        SET class_teacher_comment = COALESCE($5, class_teacher_comment),
            head_teacher_comment = COALESCE($6, head_teacher_comment)
        WHERE school_id = $1
          AND enrollment_id = ANY ($2::uuid[])
          AND term_id = $3
          AND academic_year_id = $4
        """,
        school_id,
        enrollment_ids,
        term_id,
        academic_year_id,
        class_teacher_comment,
        head_teacher_comment,
    )
    approved = 0
    if approve and actor_id is not None:
        r = await conn.execute(
            """
            UPDATE olevel_student_results
            SET approved_by = $5, approved_at = NOW()
            WHERE school_id = $1
              AND enrollment_id = ANY ($2::uuid[])
              AND term_id = $3
              AND academic_year_id = $4
            """,
            school_id,
            enrollment_ids,
            term_id,
            academic_year_id,
            actor_id,
        )
        approved = int(r.split()[-1])
    return {"saved": len(enrollment_ids), "approved": approved}


async def approve(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    actor_id: uuid.UUID,
    *,
    class_id: uuid.UUID,
    term_id: uuid.UUID,
    academic_year_id: uuid.UUID,
) -> dict[str, Any]:
    r = await conn.execute(
        """
        UPDATE olevel_student_results r
        SET approved_by = $5, approved_at = NOW()
        FROM student_curriculum_enrollments e
        WHERE r.enrollment_id = e.id
          AND r.school_id = $1
          AND e.class_id = $2
          AND r.term_id = $3
          AND r.academic_year_id = $4
        """,
        school_id,
        class_id,
        term_id,
        academic_year_id,
        actor_id,
    )
    return {"approved": int(r.split()[-1])}
