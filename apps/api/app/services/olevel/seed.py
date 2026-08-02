"""NLSC CBC defaults. Constants live here so grading remains rule-driven."""
from __future__ import annotations
import uuid
import asyncpg

GRADE_SCALE = [
    ("A", "Exceptional", 5, 80, 100, True, 1), ("B", "Outstanding", 4, 65, 79, True, 2),
    ("C", "Satisfactory", 3, 50, 64, True, 3), ("D", "Basic", 2, 40, 49, True, 4),
    ("E", "Elementary", 1, 0, 39, True, 5),
]
CATEGORIES = [("Continuous Assessment", "CA", 20, 1), ("End-of-Term Exam", "EXAM", 80, 2)]
SUBJECTS = [
 ("English Language","ENG","languages"),("Mathematics","MAT","sciences"),
 ("History & Political Education","HPE","humanities"),("Geography","GEO","humanities"),
 ("Physics","PHY","sciences"),("Biology","BIO","sciences"),("Chemistry","CHE","sciences"),
 ("Physical Education","PHE","co_curricular"),("Religious Education","RE","humanities"),
 ("Entrepreneurship","ENT","vocational"),("Kiswahili","KIS","languages"),
 ("Agriculture","AGR","vocational"),("Information & Communication Technology","ICT","vocational"),
 ("Performing Arts","PAT","vocational"),("Nutrition & Food Technology","NFT","vocational"),
 ("Art & Design","ADE","vocational"),("Technology & Design","TDE","vocational"),
 ("Literature in English","LIT","languages"),
]
LOWER_COMP = {"ENG","MAT","HPE","GEO","PHY","BIO","CHE","PHE","RE","ENT","KIS"}
LOWER_OPT = {"AGR","ICT","PAT","NFT","ADE","TDE","LIT"}
UPPER_COMP = {"ENG","MAT","PHY","BIO","CHE","GEO","HPE"}
UPPER_OPT = {"AGR","ICT","ADE","LIT","PAT","RE","NFT"}


async def seed_defaults(conn: asyncpg.Connection, school_id: uuid.UUID, curriculum_id: uuid.UUID) -> None:
    await conn.execute("""
      INSERT INTO curriculum_grade_scales
      (curriculum_id,grade,label,points,min_percent,max_percent,is_pass,display_order)
      SELECT $1,x.grade,x.label,x.points,x.min,x.max,x.pass,x.ord
      FROM UNNEST($2::text[],$3::text[],$4::numeric[],$5::numeric[],$6::numeric[],$7::boolean[],$8::int[])
      x(grade,label,points,min,max,pass,ord)
      ON CONFLICT (curriculum_id,grade) DO NOTHING
    """, curriculum_id, *[[r[i] for r in GRADE_SCALE] for i in range(7)])
    await conn.execute("""
      INSERT INTO curriculum_assessment_categories (curriculum_id,name,code,weight_percent,display_order)
      SELECT $1,x.name,x.code,x.weight,x.ord FROM UNNEST($2::text[],$3::text[],$4::numeric[],$5::int[])
      x(name,code,weight,ord) ON CONFLICT (curriculum_id,code) DO NOTHING
    """, curriculum_id, *[[r[i] for r in CATEGORIES] for i in range(4)])
    existing_rules = await conn.fetchval(
        "SELECT COUNT(*) FROM curriculum_selection_rules WHERE curriculum_id=$1",
        curriculum_id,
    )
    if not existing_rules:
        await conn.execute(
            """
            INSERT INTO curriculum_selection_rules
            (curriculum_id, applies_to_levels, levels_key, min_subjects, max_subjects,
             compulsory_count, optional_min, optional_max, optional_to_count_in_result)
            VALUES
              ($1, ARRAY['S1','S2'], 'S1,S2', 12, 12, 11, 1, 1, 1),
              ($1, ARRAY['S3','S4'], 'S3,S4', 8, 9, 7, 1, 2, 2)
            """,
            curriculum_id,
        )
    await conn.execute("""INSERT INTO curriculum_promotion_rules
      (curriculum_id,min_grade_to_pass,max_failed_compulsory,max_failed_optional) VALUES($1,'D',0,2)
      ON CONFLICT (curriculum_id) DO NOTHING""", curriculum_id)
    await conn.execute("INSERT INTO curriculum_report_rules (curriculum_id) VALUES($1) ON CONFLICT (curriculum_id) DO NOTHING", curriculum_id)
    # school_subjects has no code column in the canonical schema; identity is name.
    await conn.execute("""
      INSERT INTO school_subjects (school_id,name)
      SELECT $1,n FROM UNNEST($2::text[]) n
      ON CONFLICT (school_id,LOWER(name)) DO NOTHING
    """, school_id, [s[0] for s in SUBJECTS])
    await conn.execute("""
      INSERT INTO olevel_subjects (school_id,school_subject_id,name,code,department)
      SELECT $1,ss.id,x.name,x.code,x.department
      FROM UNNEST($2::text[],$3::text[],$4::text[]) x(name,code,department)
      JOIN school_subjects ss ON ss.school_id=$1 AND LOWER(ss.name)=LOWER(x.name)
      ON CONFLICT (school_id,code) DO UPDATE SET
        school_subject_id=COALESCE(olevel_subjects.school_subject_id,EXCLUDED.school_subject_id),
        is_active=true,updated_at=NOW()
    """, school_id, [s[0] for s in SUBJECTS], [s[1] for s in SUBJECTS], [s[2] for s in SUBJECTS])
    roles: list[str] = []
    levels: list[list[str]] = []
    codes: list[str] = []
    for code in LOWER_COMP:
        codes.append(code)
        roles.append("compulsory")
        levels.append(["S1", "S2"])
    for code in LOWER_OPT:
        codes.append(code)
        roles.append("optional")
        levels.append(["S1", "S2"])
    for code in UPPER_COMP:
        codes.append(code)
        roles.append("compulsory")
        levels.append(["S3", "S4"])
    for code in UPPER_OPT:
        codes.append(code)
        roles.append("optional")
        levels.append(["S3", "S4"])

    # Merge same subject+role across bands before insert (unique constraint).
    merged: dict[tuple[str, str], list[str]] = {}
    for code, role, lvl in zip(codes, roles, levels):
        key = (code, role)
        merged[key] = sorted(
            set(merged.get(key, []) + lvl),
            key=lambda x: (x not in ("S1", "S2"), x),
        )
    codes = [k[0] for k in merged]
    roles = [k[1] for k in merged]
    levels = list(merged.values())

    await conn.execute("""
      INSERT INTO curriculum_subjects(curriculum_id,subject_id,subject_role,applies_to_levels,display_order)
      SELECT $1,os.id,x.role,x.levels,x.ord
      FROM UNNEST($2::text[],$3::text[],$4::text[][],$5::int[]) x(code,role,levels,ord)
      JOIN olevel_subjects os ON os.school_id=$6 AND os.code=x.code
      ON CONFLICT (curriculum_id,subject_id,subject_role) DO UPDATE SET
        applies_to_levels = EXCLUDED.applies_to_levels,
        display_order = EXCLUDED.display_order,
        is_active = true
    """, curriculum_id,codes,roles,levels,list(range(1,len(codes)+1)),school_id)
