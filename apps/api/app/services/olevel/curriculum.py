from __future__ import annotations
import uuid
from typing import Any
import asyncpg
from fastapi import HTTPException
from . import serialize
from .seed import seed_defaults

def _error(message: str, code: str = "VALIDATION_ERROR") -> None:
    raise HTTPException(status_code=422, detail={"error": message, "code": code})

def _validate_scale(items: list[dict[str, Any]]) -> None:
    if len(items) < 2:
        _error("At least two grade bands are required.")
    bands = sorted(
        (
            float(x["min_percent"] if "min_percent" in x else x["minPercent"]),
            float(x["max_percent"] if "max_percent" in x else x["maxPercent"]),
        )
        for x in items
    )
    if bands[0][0] != 0 or bands[-1][1] != 100:
        _error("Grade ranges must cover 0–100.")
    if any(lo > hi for lo, hi in bands):
        _error("Each grade band must have minPercent ≤ maxPercent.")
    for i in range(len(bands) - 1):
        # Integer bands like 0–39 then 40–49 are contiguous (gap of 1).
        if bands[i][1] >= bands[i + 1][0]:
            _error("Grade ranges must not overlap.")
        if bands[i][1] + 1 < bands[i + 1][0]:
            _error("Grade ranges must be contiguous and cover 0–100.")

async def get_curriculum(conn: asyncpg.Connection, school_id: uuid.UUID, curriculum_id: uuid.UUID | None = None) -> dict[str, Any] | None:
    where = "id=$2" if curriculum_id else "is_active=true"
    args = (school_id,curriculum_id) if curriculum_id else (school_id,)
    c = await conn.fetchrow(f"SELECT * FROM curricula WHERE school_id=$1 AND {where} ORDER BY created_at DESC LIMIT 1", *args)
    if not c: return None
    cid = c["id"]
    scale,cats,rules,promotion,report = await conn.fetch(
        "SELECT * FROM curriculum_grade_scales WHERE curriculum_id=$1 ORDER BY display_order",cid),await conn.fetch(
        "SELECT * FROM curriculum_assessment_categories WHERE curriculum_id=$1 ORDER BY display_order",cid),await conn.fetch(
        "SELECT * FROM curriculum_selection_rules WHERE curriculum_id=$1",cid),await conn.fetchrow(
        "SELECT * FROM curriculum_promotion_rules WHERE curriculum_id=$1",cid),await conn.fetchrow(
        "SELECT * FROM curriculum_report_rules WHERE curriculum_id=$1",cid)
    return serialize.curriculum(c,grade_scale_=scale,categories=cats,selection_rules_=rules,promotion_rules=promotion,report_rules=report)

async def setup(conn: asyncpg.Connection, school_id: uuid.UUID, actor_id: uuid.UUID, payload: dict[str, Any]) -> dict[str, Any]:
    year_from = payload.get("academic_year_from", payload.get("academicYearFrom"))
    if year_from is None:
        _error("academicYearFrom is required.")
    seed = payload.get("seed_defaults", payload.get("seedDefaults", True))
    row = await conn.fetchrow("""INSERT INTO curricula(school_id,name,description,academic_year_from,created_by)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(school_id,name) DO UPDATE SET description=EXCLUDED.description,updated_at=NOW() RETURNING *""",
      school_id,payload.get("name","Uganda NLSC CBC").strip(),payload.get("description"),year_from,actor_id)
    if seed: await seed_defaults(conn,school_id,row["id"])
    return (await get_curriculum(conn,school_id,row["id"]))  # type: ignore[return-value]

async def patch_curriculum(conn: asyncpg.Connection, school_id: uuid.UUID, curriculum_id: uuid.UUID, payload: dict[str, Any]) -> dict[str, Any]:
    row=await conn.fetchrow("""UPDATE curricula SET name=COALESCE($3,name),description=COALESCE($4,description),
      academic_year_from=COALESCE($5,academic_year_from),academic_year_to=COALESCE($6,academic_year_to),
      is_active=COALESCE($7,is_active),updated_at=NOW() WHERE id=$1 AND school_id=$2 RETURNING *""",
      curriculum_id,school_id,payload.get("name"),payload.get("description"),payload.get("academic_year_from"),payload.get("academic_year_to"),payload.get("is_active"))
    if not row: raise LookupError("Curriculum not found.")
    return (await get_curriculum(conn,school_id,curriculum_id))  # type: ignore[return-value]

async def replace_grade_scale(conn: asyncpg.Connection, school_id: uuid.UUID, curriculum_id: uuid.UUID, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    _validate_scale(items); await _assert(conn,school_id,curriculum_id)
    await conn.execute("DELETE FROM curriculum_grade_scales WHERE curriculum_id=$1",curriculum_id)
    await conn.execute("""INSERT INTO curriculum_grade_scales(curriculum_id,grade,label,points,min_percent,max_percent,is_pass,display_order)
      SELECT $1,x.grade,x.label,x.points,x.min,x.max,x.pass,x.ord FROM UNNEST($2::text[],$3::text[],$4::numeric[],$5::numeric[],$6::numeric[],$7::boolean[],$8::int[]) x(grade,label,points,min,max,pass,ord)""",
      curriculum_id,[x["grade"] for x in items],[x["label"] for x in items],[x["points"] for x in items],
      [x.get("min_percent",x.get("minPercent")) for x in items],[x.get("max_percent",x.get("maxPercent")) for x in items],
      [x.get("is_pass",x.get("isPass",True)) for x in items],[x.get("display_order",x.get("displayOrder",i+1)) for i,x in enumerate(items)])
    return [serialize.grade_scale(x) for x in await conn.fetch("SELECT * FROM curriculum_grade_scales WHERE curriculum_id=$1 ORDER BY display_order",curriculum_id)]

async def replace_categories(conn: asyncpg.Connection, school_id: uuid.UUID, curriculum_id: uuid.UUID, items: list[dict[str,Any]]) -> list[dict[str,Any]]:
    total=sum(float(x.get("weight_percent",x.get("weightPercent",0))) for x in items)
    if abs(total-100)>0.01: _error(f"Current sum: {total:g}%. Must equal 100%.")
    await _assert(conn,school_id,curriculum_id); await conn.execute("DELETE FROM curriculum_assessment_categories WHERE curriculum_id=$1",curriculum_id)
    await conn.execute("""INSERT INTO curriculum_assessment_categories(curriculum_id,name,code,weight_percent,display_order,is_active)
      SELECT $1,x.name,x.code,x.weight,x.ord,x.active FROM UNNEST($2::text[],$3::text[],$4::numeric[],$5::int[],$6::boolean[]) x(name,code,weight,ord,active)""",curriculum_id,[x["name"] for x in items],[x["code"] for x in items],[x.get("weight_percent",x.get("weightPercent")) for x in items],[x.get("display_order",x.get("displayOrder",i+1)) for i,x in enumerate(items)],[x.get("is_active",x.get("isActive",True)) for x in items])
    return [serialize.category(x) for x in await conn.fetch("SELECT * FROM curriculum_assessment_categories WHERE curriculum_id=$1 ORDER BY display_order",curriculum_id)]

async def replace_selection_rules(conn: asyncpg.Connection, school_id: uuid.UUID, curriculum_id: uuid.UUID, items: list[dict[str,Any]]) -> list[dict[str,Any]]:
    await _assert(conn,school_id,curriculum_id)
    normalized: list[dict[str, Any]] = []
    for x in items:
        row = {
            "applies_to_levels": x.get("applies_to_levels", x.get("appliesToLevels")),
            "min_subjects": int(x.get("min_subjects", x.get("minSubjects"))),
            "max_subjects": int(x.get("max_subjects", x.get("maxSubjects"))),
            "compulsory_count": int(x.get("compulsory_count", x.get("compulsoryCount"))),
            "optional_min": int(x.get("optional_min", x.get("optionalMin"))),
            "optional_max": int(x.get("optional_max", x.get("optionalMax"))),
            "optional_to_count_in_result": int(
                x.get("optional_to_count_in_result", x.get("optionalToCountInResult"))
            ),
        }
        if row["min_subjects"] > row["max_subjects"] or row["optional_min"] > row["optional_max"]:
            _error("Selection rule minimum cannot exceed maximum.")
        normalized.append(row)
    await conn.execute("DELETE FROM curriculum_selection_rules WHERE curriculum_id=$1", curriculum_id)
    for x in normalized:
        levels = list(x["applies_to_levels"] or [])
        levels_key = ",".join(levels)
        await conn.execute(
            """
            INSERT INTO curriculum_selection_rules(
              curriculum_id, applies_to_levels, levels_key, min_subjects, max_subjects,
              compulsory_count, optional_min, optional_max, optional_to_count_in_result
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            """,
            curriculum_id,
            levels,
            levels_key,
            x["min_subjects"],
            x["max_subjects"],
            x["compulsory_count"],
            x["optional_min"],
            x["optional_max"],
            x["optional_to_count_in_result"],
        )
    return [
        serialize.selection_rule(x)
        for x in await conn.fetch(
            "SELECT * FROM curriculum_selection_rules WHERE curriculum_id=$1", curriculum_id
        )
    ]

async def replace_promotion_rules(conn: asyncpg.Connection, school_id: uuid.UUID, curriculum_id: uuid.UUID, payload: dict[str,Any]) -> dict[str,Any]:
    await _assert(conn,school_id,curriculum_id); r=await conn.fetchrow("""INSERT INTO curriculum_promotion_rules(curriculum_id,min_grade_to_pass,max_failed_compulsory,max_failed_optional,attendance_min_percent) VALUES($1,$2,$3,$4,$5) ON CONFLICT(curriculum_id) DO UPDATE SET min_grade_to_pass=EXCLUDED.min_grade_to_pass,max_failed_compulsory=EXCLUDED.max_failed_compulsory,max_failed_optional=EXCLUDED.max_failed_optional,attendance_min_percent=EXCLUDED.attendance_min_percent RETURNING *""",curriculum_id,payload.get("min_grade_to_pass",payload.get("minGradeToPass")),payload.get("max_failed_compulsory",payload.get("maxFailedCompulsory",0)),payload.get("max_failed_optional",payload.get("maxFailedOptional",0)),payload.get("attendance_min_percent",payload.get("attendanceMinPercent"))); return serialize.row(r)

async def replace_report_rules(conn: asyncpg.Connection, school_id: uuid.UUID, curriculum_id: uuid.UUID, payload: dict[str,Any]) -> dict[str,Any]:
    await _assert(conn,school_id,curriculum_id); allowed={"show_grades","show_percentages","show_points","show_remarks","show_class_position","show_subject_position","show_division_ranking","show_result_code","show_teacher_comment","show_head_teacher_comment","show_attendance","report_title","custom_footer_text"}
    snake={''.join(("_"+c.lower()) if c.isupper() else c for c in k):v for k,v in payload.items()}; vals={k:snake[k] for k in allowed if k in snake}; cols=", ".join(vals); placeholders=", ".join(f"${i+2}" for i in range(len(vals))); updates=", ".join(f"{k}=EXCLUDED.{k}" for k in vals)
    r=await conn.fetchrow(f"INSERT INTO curriculum_report_rules(curriculum_id,{cols}) VALUES($1,{placeholders}) ON CONFLICT(curriculum_id) DO UPDATE SET {updates} RETURNING *",curriculum_id,*vals.values()); return serialize.row(r)

async def _assert(conn: asyncpg.Connection, school_id: uuid.UUID, curriculum_id: uuid.UUID) -> None:
    if not await conn.fetchval("SELECT 1 FROM curricula WHERE id=$1 AND school_id=$2",curriculum_id,school_id): raise LookupError("Curriculum not found.")
