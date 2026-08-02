from __future__ import annotations

import json
import uuid
from decimal import Decimal
from typing import Any

import asyncpg
from fastapi import HTTPException

from app.lib import grading_engine


def _pct(raw: Any, max_marks: Any) -> float:
    """Percentage with missing/absent treated as zero."""
    return grading_engine.calculate_percentage(raw, max_marks)


async def load_rules(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    curriculum_id: uuid.UUID,
    level: str,
) -> dict[str, Any]:
    return {
        "assessment_categories": [
            dict(x)
            for x in await conn.fetch(
                """
                SELECT * FROM curriculum_assessment_categories
                WHERE curriculum_id = $1 AND is_active
                """,
                curriculum_id,
            )
        ],
        "grade_scale": [
            dict(x)
            for x in await conn.fetch(
                """
                SELECT * FROM curriculum_grade_scales
                WHERE curriculum_id = $1
                ORDER BY display_order
                """,
                curriculum_id,
            )
        ],
        "selection_rules": dict(
            await conn.fetchrow(
                """
                SELECT * FROM curriculum_selection_rules
                WHERE curriculum_id = $1 AND $2 = ANY (applies_to_levels)
                """,
                curriculum_id,
                level,
            )
            or {}
        ),
        "promotion_rules": dict(
            await conn.fetchrow(
                """
                SELECT * FROM curriculum_promotion_rules
                WHERE curriculum_id = $1
                """,
                curriculum_id,
            )
            or {}
        ),
    }


async def get_grading_selection(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    class_id: uuid.UUID,
    term_id: uuid.UUID,
    academic_year_id: uuid.UUID,
) -> dict[str, Any] | None:
    row = await conn.fetchrow(
        """
        SELECT *
        FROM olevel_term_grading_selections
        WHERE school_id = $1
          AND class_id = $2
          AND term_id = $3
          AND academic_year_id = $4
        """,
        school_id,
        class_id,
        term_id,
        academic_year_id,
    )
    if not row:
        return None
    return {
        "examSessionId": str(row["exam_session_id"]),
        "assessmentSessionIds": [str(x) for x in (row["assessment_session_ids"] or [])],
        "selectedAt": row["selected_at"].isoformat() if row["selected_at"] else None,
        "selectedBy": str(row["selected_by"]) if row["selected_by"] else None,
    }


async def save_grading_selection(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    class_id: uuid.UUID,
    term_id: uuid.UUID,
    academic_year_id: uuid.UUID,
    exam_session_id: uuid.UUID,
    assessment_session_ids: list[uuid.UUID],
    actor_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    await _validate_selection(
        conn,
        school_id,
        class_id=class_id,
        term_id=term_id,
        academic_year_id=academic_year_id,
        exam_session_id=exam_session_id,
        assessment_session_ids=assessment_session_ids,
    )
    await conn.execute(
        """
        INSERT INTO olevel_term_grading_selections (
          school_id, class_id, term_id, academic_year_id,
          exam_session_id, assessment_session_ids, selected_by, selected_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::uuid[], $7, NOW())
        ON CONFLICT (school_id, class_id, term_id, academic_year_id) DO UPDATE SET
          exam_session_id = EXCLUDED.exam_session_id,
          assessment_session_ids = EXCLUDED.assessment_session_ids,
          selected_by = EXCLUDED.selected_by,
          selected_at = NOW()
        """,
        school_id,
        class_id,
        term_id,
        academic_year_id,
        exam_session_id,
        assessment_session_ids,
        actor_id,
    )
    return {
        "examSessionId": str(exam_session_id),
        "assessmentSessionIds": [str(x) for x in assessment_session_ids],
    }


async def _validate_selection(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    class_id: uuid.UUID,
    term_id: uuid.UUID,
    academic_year_id: uuid.UUID,
    exam_session_id: uuid.UUID,
    assessment_session_ids: list[uuid.UUID],
) -> dict[str, Any]:
    if not assessment_session_ids:
        raise HTTPException(
            422,
            detail={
                "error": "Select at least one continuous assessment session.",
                "code": "ASSESSMENT_SELECTION_REQUIRED",
            },
        )
    if exam_session_id in assessment_session_ids:
        raise HTTPException(
            422,
            detail={
                "error": "End-of-term exam cannot also be listed as an assessment.",
                "code": "VALIDATION_ERROR",
            },
        )

    all_ids = list({*assessment_session_ids, exam_session_id})
    rows = await conn.fetch(
        """
        SELECT es.id, es.category_id, c.code AS category_code, c.weight_percent
        FROM olevel_exam_sessions es
        JOIN curriculum_assessment_categories c ON c.id = es.category_id
        WHERE es.school_id = $1
          AND es.class_id = $2
          AND es.term_id = $3
          AND es.academic_year_id = $4
          AND es.id = ANY ($5::uuid[])
          AND es.deleted_at IS NULL
        """,
        school_id,
        class_id,
        term_id,
        academic_year_id,
        all_ids,
    )
    by_id = {r["id"]: r for r in rows}
    missing = [str(i) for i in all_ids if i not in by_id]
    if missing:
        raise HTTPException(
            422,
            detail={
                "error": "One or more selected sessions are missing, deleted, or do not belong to this class and term.",
                "code": "SESSION_MISMATCH",
            },
        )

    exam = by_id[exam_session_id]
    for sid in assessment_session_ids:
        if by_id[sid]["category_id"] == exam["category_id"]:
            raise HTTPException(
                422,
                detail={
                    "error": "Assessment sessions must use the continuous assessment category, not the end-of-term exam category.",
                    "code": "VALIDATION_ERROR",
                },
            )

    ca_codes = {by_id[sid]["category_code"] for sid in assessment_session_ids}
    if len(ca_codes) != 1:
        raise HTTPException(
            422,
            detail={
                "error": "All selected assessments must share the same assessment category.",
                "code": "VALIDATION_ERROR",
            },
        )

    return {
        "assessment_code": next(iter(ca_codes)),
        "exam_code": exam["category_code"],
    }


async def resolve_selection(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    class_id: uuid.UUID,
    term_id: uuid.UUID,
    academic_year_id: uuid.UUID,
    exam_session_id: uuid.UUID | None = None,
    assessment_session_ids: list[uuid.UUID] | None = None,
) -> tuple[uuid.UUID, list[uuid.UUID], str, str]:
    """Return (exam_id, assessment_ids, assessment_code, exam_code)."""
    if exam_session_id is not None and assessment_session_ids is not None:
        meta = await _validate_selection(
            conn,
            school_id,
            class_id=class_id,
            term_id=term_id,
            academic_year_id=academic_year_id,
            exam_session_id=exam_session_id,
            assessment_session_ids=assessment_session_ids,
        )
        return (
            exam_session_id,
            assessment_session_ids,
            meta["assessment_code"],
            meta["exam_code"],
        )

    saved = await get_grading_selection(
        conn,
        school_id,
        class_id=class_id,
        term_id=term_id,
        academic_year_id=academic_year_id,
    )
    if not saved or not saved["assessmentSessionIds"] or not saved["examSessionId"]:
        raise HTTPException(
            422,
            detail={
                "error": "Choose which assessment sessions and end-of-term exam to include before generating results.",
                "code": "GRADING_SELECTION_REQUIRED",
            },
        )
    exam_id = uuid.UUID(saved["examSessionId"])
    assess_ids = [uuid.UUID(x) for x in saved["assessmentSessionIds"]]
    meta = await _validate_selection(
        conn,
        school_id,
        class_id=class_id,
        term_id=term_id,
        academic_year_id=academic_year_id,
        exam_session_id=exam_id,
        assessment_session_ids=assess_ids,
    )
    return exam_id, assess_ids, meta["assessment_code"], meta["exam_code"]


async def build_enrollment_data(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    enrollment_id: uuid.UUID,
    term_id: uuid.UUID,
    academic_year_id: uuid.UUID,
    *,
    assessment_session_ids: list[uuid.UUID],
    exam_session_id: uuid.UUID,
    assessment_code: str,
    exam_code: str,
) -> dict[str, Any]:
    e = await conn.fetchrow(
        """
        SELECT e.*, sc.level
        FROM student_curriculum_enrollments e
        JOIN school_classes sc ON sc.id = e.class_id
        WHERE e.id = $1 AND e.school_id = $2
        """,
        enrollment_id,
        school_id,
    )
    if not e:
        raise LookupError("Enrollment not found.")

    regs = await conn.fetch(
        """
        SELECT r.subject_id, r.subject_role, os.name, os.code
        FROM student_subject_registrations r
        JOIN olevel_subjects os ON os.id = r.subject_id
        WHERE r.enrollment_id = $1 AND r.status = 'active'
        """,
        enrollment_id,
    )

    session_ids = list({*assessment_session_ids, exam_session_id})
    mark_rows = await conn.fetch(
        """
        SELECT m.subject_id, m.exam_session_id, m.raw_score, es.max_marks
        FROM olevel_marks m
        JOIN olevel_exam_sessions es ON es.id = m.exam_session_id
        WHERE m.student_id = $1
          AND m.exam_session_id = ANY ($2::uuid[])
        """,
        e["student_id"],
        session_ids,
    )
    # session max marks (even when student has no mark row)
    session_meta = {
        r["id"]: float(r["max_marks"] or 0)
        for r in await conn.fetch(
            "SELECT id, max_marks FROM olevel_exam_sessions WHERE id = ANY ($1::uuid[])",
            session_ids,
        )
    }
    marks_by: dict[tuple[Any, Any], Any] = {
        (r["subject_id"], r["exam_session_id"]): r["raw_score"] for r in mark_rows
    }

    subjects: list[dict[str, Any]] = []
    for reg in regs:
        sid = reg["subject_id"]
        assess_pcts: list[float] = []
        for sess_id in assessment_session_ids:
            raw = marks_by.get((sid, sess_id))
            assess_pcts.append(_pct(raw, session_meta.get(sess_id, 0)))
        assessment_percent = (
            float(
                (
                    sum(Decimal(str(p)) for p in assess_pcts) / Decimal(len(assess_pcts))
                ).quantize(Decimal("0.01"))
            )
            if assess_pcts
            else 0.0
        )
        exam_raw = marks_by.get((sid, exam_session_id))
        exam_percent = _pct(exam_raw, session_meta.get(exam_session_id, 0))

        # Feed pre-averaged percentages into the engine as scores out of 100.
        subjects.append(
            {
                "subject_id": str(sid),
                "subject_role": reg["subject_role"],
                "subject_name": reg["name"],
                "subject_code": reg["code"],
                "category_scores_raw": {
                    assessment_code: assessment_percent,
                    exam_code: exam_percent,
                },
                "max_marks_by_category": {
                    assessment_code: 100,
                    exam_code: 100,
                },
                "assessment_percent": assessment_percent,
                "exam_percent": exam_percent,
            }
        )

    return {
        "enrollment_id": str(e["id"]),
        "student_id": str(e["student_id"]),
        "class_level": e["level"],
        "curriculum_id": e["curriculum_id"],
        "subjects": subjects,
    }


async def persist_result(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    data: dict[str, Any],
    result: dict[str, Any],
    term_id: uuid.UUID,
    academic_year_id: uuid.UUID,
) -> None:
    subjects = result["subjects"]
    # Merge assessment/exam percents from enrollment data by subject_id
    breakdown = {
        s["subject_id"]: s
        for s in data.get("subjects") or []
    }
    if subjects:
        await conn.execute(
            """
            INSERT INTO olevel_subject_results(
              school_id, enrollment_id, subject_id, subject_role, academic_year_id, term_id,
              category_scores, weighted_score, grade, points, is_pass, counts_in_result,
              assessment_percent, exam_percent, grade_label
            )
            SELECT $1, $2, x.subject, x.role, $3, $4, x.scores::jsonb, x.weighted, x.grade,
                   x.points, x.pass, x.counts, x.assess, x.exam, x.label
            FROM UNNEST(
              $5::uuid[], $6::text[], $7::text[], $8::numeric[], $9::text[],
              $10::numeric[], $11::boolean[], $12::boolean[],
              $13::numeric[], $14::numeric[], $15::text[]
            ) x(subject, role, scores, weighted, grade, points, pass, counts, assess, exam, label)
            ON CONFLICT (enrollment_id, subject_id, academic_year_id, term_id) DO UPDATE SET
              category_scores = EXCLUDED.category_scores,
              weighted_score = EXCLUDED.weighted_score,
              grade = EXCLUDED.grade,
              points = EXCLUDED.points,
              is_pass = EXCLUDED.is_pass,
              counts_in_result = EXCLUDED.counts_in_result,
              assessment_percent = EXCLUDED.assessment_percent,
              exam_percent = EXCLUDED.exam_percent,
              grade_label = EXCLUDED.grade_label,
              calculated_at = NOW()
            """,
            school_id,
            uuid.UUID(data["enrollment_id"]),
            academic_year_id,
            term_id,
            [uuid.UUID(x["subject_id"]) for x in subjects],
            [x["subject_role"] for x in subjects],
            [json.dumps(x.get("category_scores") or {}) for x in subjects],
            [x["weighted_score"] for x in subjects],
            [x["grade"] for x in subjects],
            [x["points"] for x in subjects],
            [x["is_pass"] for x in subjects],
            [x["counts_in_result"] for x in subjects],
            [
                breakdown.get(str(x["subject_id"]), {}).get("assessment_percent", 0)
                for x in subjects
            ],
            [
                breakdown.get(str(x["subject_id"]), {}).get("exam_percent", 0)
                for x in subjects
            ],
            [x.get("label") for x in subjects],
        )
    t = result["totals"]
    await conn.execute(
        """
        INSERT INTO olevel_student_results(
          school_id, enrollment_id, academic_year_id, term_id,
          compulsory_passed, compulsory_failed, optional_passed, optional_failed,
          subjects_counted, total_points, average_percent, is_promoted, promotion_reason
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (enrollment_id, academic_year_id, term_id) DO UPDATE SET
          compulsory_passed = EXCLUDED.compulsory_passed,
          compulsory_failed = EXCLUDED.compulsory_failed,
          optional_passed = EXCLUDED.optional_passed,
          optional_failed = EXCLUDED.optional_failed,
          subjects_counted = EXCLUDED.subjects_counted,
          total_points = EXCLUDED.total_points,
          average_percent = EXCLUDED.average_percent,
          is_promoted = EXCLUDED.is_promoted,
          promotion_reason = EXCLUDED.promotion_reason,
          approved_by = NULL,
          approved_at = NULL,
          calculated_at = NOW()
        """,
        school_id,
        uuid.UUID(data["enrollment_id"]),
        academic_year_id,
        term_id,
        t["compulsory_passed"],
        t["compulsory_failed"],
        t["optional_passed"],
        t["optional_failed"],
        t["subjects_counted"],
        t["total_points"],
        t["average_percent"],
        result["is_promoted"],
        result["promotion_reason"],
    )


async def grade_student(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    enrollment_id: uuid.UUID,
    term_id: uuid.UUID,
    academic_year_id: uuid.UUID,
    assessment_session_ids: list[uuid.UUID],
    exam_session_id: uuid.UUID,
    assessment_code: str,
    exam_code: str,
    persist: bool = True,
) -> dict[str, Any]:
    d = await build_enrollment_data(
        conn,
        school_id,
        enrollment_id,
        term_id,
        academic_year_id,
        assessment_session_ids=assessment_session_ids,
        exam_session_id=exam_session_id,
        assessment_code=assessment_code,
        exam_code=exam_code,
    )
    r = grading_engine.run_grading_pipeline_data(
        d, await load_rules(conn, school_id, d["curriculum_id"], d["class_level"])
    )
    if persist:
        await persist_result(conn, school_id, d, r, term_id, academic_year_id)
    return r


async def grade_class(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    class_id: uuid.UUID,
    term_id: uuid.UUID,
    academic_year_id: uuid.UUID,
    assessment_session_ids: list[uuid.UUID],
    exam_session_id: uuid.UUID,
    assessment_code: str,
    exam_code: str,
) -> dict[str, Any]:
    ids = await conn.fetch(
        """
        SELECT id FROM student_curriculum_enrollments
        WHERE school_id = $1 AND class_id = $2 AND academic_year_id = $3
        """,
        school_id,
        class_id,
        academic_year_id,
    )
    calculated = 0
    failed: list[str] = []
    for x in ids:
        try:
            await grade_student(
                conn,
                school_id,
                enrollment_id=x["id"],
                term_id=term_id,
                academic_year_id=academic_year_id,
                assessment_session_ids=assessment_session_ids,
                exam_session_id=exam_session_id,
                assessment_code=assessment_code,
                exam_code=exam_code,
            )
            calculated += 1
        except Exception as exc:  # noqa: BLE001
            failed.append(f"{x['id']}: {exc}")
    return {"calculated": calculated, "failed": len(failed), "errors": failed[:10]}


async def preview(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    enrollment_id: uuid.UUID,
    term_id: uuid.UUID,
    academic_year_id: uuid.UUID,
    class_id: uuid.UUID,
    exam_session_id: uuid.UUID | None = None,
    assessment_session_ids: list[uuid.UUID] | None = None,
) -> dict[str, Any]:
    exam_id, assess_ids, a_code, e_code = await resolve_selection(
        conn,
        school_id,
        class_id=class_id,
        term_id=term_id,
        academic_year_id=academic_year_id,
        exam_session_id=exam_session_id,
        assessment_session_ids=assessment_session_ids,
    )
    return await grade_student(
        conn,
        school_id,
        enrollment_id=enrollment_id,
        term_id=term_id,
        academic_year_id=academic_year_id,
        assessment_session_ids=assess_ids,
        exam_session_id=exam_id,
        assessment_code=a_code,
        exam_code=e_code,
        persist=False,
    )


async def recalculate_rankings(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    class_id: uuid.UUID,
    term_id: uuid.UUID,
    academic_year_id: uuid.UUID,
) -> dict[str, Any]:
    await conn.execute(
        """
        WITH ranked AS (
          SELECT r.id,
                 row_number() OVER (
                   ORDER BY r.total_points DESC, r.average_percent DESC
                 ) AS pos,
                 count(*) OVER () AS n
          FROM olevel_student_results r
          JOIN student_curriculum_enrollments e ON e.id = r.enrollment_id
          WHERE r.school_id = $1 AND e.class_id = $2
            AND r.term_id = $3 AND r.academic_year_id = $4
        )
        UPDATE olevel_student_results r
        SET class_position = x.pos, total_students_in_class = x.n
        FROM ranked x
        WHERE r.id = x.id
        """,
        school_id,
        class_id,
        term_id,
        academic_year_id,
    )
    await conn.execute(
        """
        WITH ranked AS (
          SELECT sr.id,
                 row_number() OVER (
                   PARTITION BY sr.subject_id
                   ORDER BY sr.weighted_score DESC NULLS LAST, sr.points DESC NULLS LAST
                 ) AS pos
          FROM olevel_subject_results sr
          JOIN student_curriculum_enrollments e ON e.id = sr.enrollment_id
          WHERE sr.school_id = $1 AND e.class_id = $2
            AND sr.term_id = $3 AND sr.academic_year_id = $4
        )
        UPDATE olevel_subject_results sr
        SET subject_position = x.pos
        FROM ranked x
        WHERE sr.id = x.id
        """,
        school_id,
        class_id,
        term_id,
        academic_year_id,
    )
    updated = await conn.fetchval(
        """
        SELECT COUNT(*)
        FROM olevel_student_results r
        JOIN student_curriculum_enrollments e ON e.id = r.enrollment_id
        WHERE r.school_id = $1 AND e.class_id = $2
          AND r.term_id = $3 AND r.academic_year_id = $4
        """,
        school_id,
        class_id,
        term_id,
        academic_year_id,
    )
    return {"updated": int(updated or 0)}


async def generate_class_results(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    class_id: uuid.UUID,
    term_id: uuid.UUID,
    academic_year_id: uuid.UUID,
    exam_session_id: uuid.UUID | None = None,
    assessment_session_ids: list[uuid.UUID] | None = None,
    actor_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    """Persist selection (if provided), grade every enrolled student, then rank."""
    exam_id, assess_ids, a_code, e_code = await resolve_selection(
        conn,
        school_id,
        class_id=class_id,
        term_id=term_id,
        academic_year_id=academic_year_id,
        exam_session_id=exam_session_id,
        assessment_session_ids=assessment_session_ids,
    )
    if exam_session_id is not None and assessment_session_ids is not None:
        await save_grading_selection(
            conn,
            school_id,
            class_id=class_id,
            term_id=term_id,
            academic_year_id=academic_year_id,
            exam_session_id=exam_id,
            assessment_session_ids=assess_ids,
            actor_id=actor_id,
        )

    graded = await grade_class(
        conn,
        school_id,
        class_id=class_id,
        term_id=term_id,
        academic_year_id=academic_year_id,
        assessment_session_ids=assess_ids,
        exam_session_id=exam_id,
        assessment_code=a_code,
        exam_code=e_code,
    )
    ranked = await recalculate_rankings(
        conn,
        school_id,
        class_id=class_id,
        term_id=term_id,
        academic_year_id=academic_year_id,
    )
    return {
        "calculated": graded["calculated"],
        "ranked": ranked["updated"],
        "failed": graded.get("failed", 0),
        "errors": graded.get("errors") or [],
        "selection": {
            "examSessionId": str(exam_id),
            "assessmentSessionIds": [str(x) for x in assess_ids],
        },
    }
