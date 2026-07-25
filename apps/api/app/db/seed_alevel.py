"""Seed standard UACE A-Level subjects, combinations, and grading scale.

Idempotent. Targets one school by slug so it is safe to re-run.

Usage:
    .venv/bin/python -m app.db.seed_alevel --school <school-slug>
    .venv/bin/python -m app.db.seed_alevel                # uses SEED_SCHOOL_SLUG env
"""

from __future__ import annotations

import argparse
import asyncio
import os
import uuid

import asyncpg

from app.config import settings
from app.lib.alevel import PRINCIPAL_BANDS, SUBSIDIARY_PASS_THRESHOLD

# (name, code, subject_type, is_gp)
SUBJECTS: list[tuple[str, str, str, bool]] = [
    ("Mathematics", "MTC", "principal", False),
    ("Physics", "PHY", "principal", False),
    ("Chemistry", "CHE", "principal", False),
    ("Biology", "BIO", "principal", False),
    ("Geography", "GEO", "principal", False),
    ("History", "HIS", "principal", False),
    ("Economics", "ECO", "principal", False),
    ("Literature in English", "LIT", "principal", False),
    ("Divinity (CRE)", "DIV", "principal", False),
    ("Entrepreneurship", "ENT", "principal", False),
    ("Fine Art", "ART", "principal", False),
    ("Agriculture", "AGR", "principal", False),
    ("General Paper", "GP", "subsidiary", True),
    ("Subsidiary Mathematics", "SUBMTC", "subsidiary", False),
    ("Subsidiary ICT", "SUBICT", "subsidiary", False),
]

# (name, label, category, [principal codes])
COMBINATIONS: list[tuple[str, str, str, list[str]]] = [
    ("PCM", "Physics, Chemistry, Mathematics", "science", ["PHY", "CHE", "MTC"]),
    ("PCB", "Physics, Chemistry, Biology", "science", ["PHY", "CHE", "BIO"]),
    ("BCM", "Biology, Chemistry, Mathematics", "science", ["BIO", "CHE", "MTC"]),
    ("HEG", "History, Economics, Geography", "arts", ["HIS", "ECO", "GEO"]),
    ("HEL", "History, Economics, Literature", "arts", ["HIS", "ECO", "LIT"]),
    ("HED", "History, Economics, Divinity", "arts", ["HIS", "ECO", "DIV"]),
    ("EGM", "Economics, Geography, Mathematics", "business", ["ECO", "GEO", "MTC"]),
]


async def seed_alevel(slug: str) -> None:
    conn = await asyncpg.connect(dsn=settings.DATABASE_URL)
    try:
        school_id = await conn.fetchval(
            "SELECT id FROM schools WHERE slug = $1 LIMIT 1", slug
        )
        if not school_id:
            raise RuntimeError(f"No school found with slug '{slug}'.")

        print(f"Seeding A-Level data for school '{slug}' ({school_id})…")

        code_to_id: dict[str, uuid.UUID] = {}
        for name, code, subject_type, is_gp in SUBJECTS:
            # Subject identity lives in the school-wide catalogue.
            base_id = await conn.fetchval(
                """
                SELECT id FROM school_subjects
                WHERE school_id = $1 AND LOWER(name) = LOWER($2)
                """,
                school_id,
                name,
            )
            if not base_id:
                base_id = await conn.fetchval(
                    """
                    INSERT INTO school_subjects (id, school_id, name)
                    VALUES (gen_random_uuid(), $1, $2)
                    RETURNING id
                    """,
                    school_id,
                    name,
                )
            subject_id = await conn.fetchval(
                """
                INSERT INTO alevel_subjects
                  (school_id, school_subject_id, code, subject_type, is_gp)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (school_id, school_subject_id)
                DO UPDATE SET code = EXCLUDED.code,
                              subject_type = EXCLUDED.subject_type,
                              is_gp = EXCLUDED.is_gp,
                              updated_at = NOW()
                RETURNING id
                """,
                school_id,
                base_id,
                code,
                subject_type,
                is_gp,
            )
            code_to_id[code] = subject_id
        print(f"  Subjects: {len(SUBJECTS)}")

        for name, label, category, codes in COMBINATIONS:
            combo_id = await conn.fetchval(
                """
                INSERT INTO alevel_combinations (school_id, name, label, category)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (school_id, name)
                DO UPDATE SET label = EXCLUDED.label, category = EXCLUDED.category
                RETURNING id
                """,
                school_id,
                name,
                label,
                category,
            )
            await conn.execute(
                "DELETE FROM alevel_combination_subjects WHERE combination_id = $1",
                combo_id,
            )
            for code in codes:
                await conn.execute(
                    """
                    INSERT INTO alevel_combination_subjects (school_id, combination_id, subject_id)
                    VALUES ($1, $2, $3)
                    """,
                    school_id,
                    combo_id,
                    code_to_id[code],
                )
        print(f"  Combinations: {len(COMBINATIONS)}")

        has_bands = await conn.fetchval(
            "SELECT 1 FROM alevel_grade_bands WHERE school_id = $1 LIMIT 1", school_id
        )
        if not has_bands:
            for min_score, grade, points in PRINCIPAL_BANDS:
                await conn.execute(
                    """
                    INSERT INTO alevel_grade_bands (school_id, min_score, grade, points)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (school_id, grade) DO NOTHING
                    """,
                    school_id,
                    min_score,
                    grade,
                    points,
                )
            await conn.execute(
                """
                INSERT INTO alevel_config (school_id, subsidiary_pass_threshold)
                VALUES ($1, $2)
                ON CONFLICT (school_id) DO NOTHING
                """,
                school_id,
                SUBSIDIARY_PASS_THRESHOLD,
            )
            print("  Grading scale: UNEB defaults installed")
        else:
            print("  Grading scale: already configured, left unchanged")

        print("Done.")
    finally:
        await conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed A-Level starter data.")
    parser.add_argument(
        "--school",
        default=os.getenv("SEED_SCHOOL_SLUG"),
        help="School slug to seed (or set SEED_SCHOOL_SLUG).",
    )
    args = parser.parse_args()
    if not args.school:
        raise SystemExit("Provide --school <slug> or set SEED_SCHOOL_SLUG.")
    asyncio.run(seed_alevel(args.school))


if __name__ == "__main__":
    main()
