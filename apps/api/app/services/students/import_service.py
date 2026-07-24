from __future__ import annotations

import json
import uuid
from datetime import date, datetime, timezone
from typing import Any, Literal

import asyncpg

from app.services.students.import_csv import (
    load_class_map,
    load_existing_fingerprints,
    parse_csv_bytes,
    validate_row,
)
from app.services.students.accounts import provision_learner_account
from app.services.students.learner_ids import allocate_learner_ids

DuplicateStrategy = Literal["skip", "import_all"]
IMPORT_JOB_TTL_HOURS = 2


async def preview_import(
    conn: asyncpg.Connection,
    *,
    school_id: uuid.UUID,
    actor_id: uuid.UUID,
    filename: str,
    raw: bytes,
) -> dict[str, Any]:
    _, records = parse_csv_bytes(raw)
    if not records:
        return {
            "job_id": None,
            "total_rows": 0,
            "valid_count": 0,
            "error_count": 1,
            "duplicate_count": 0,
            "can_confirm": False,
            "errors": [
                {
                    "row": 0,
                    "field": "file",
                    "code": "NO_ROWS",
                    "message": "The CSV file has column headers but no student rows.",
                }
            ],
            "duplicates": [],
            "sample_valid_rows": [],
        }

    class_by_name = await load_class_map(conn, school_id)
    existing_fingerprints = await load_existing_fingerprints(conn, school_id)

    job_id = uuid.uuid4()
    staging_rows: list[tuple[Any, ...]] = []
    errors: list[dict[str, Any]] = []
    duplicates: list[dict[str, Any]] = []
    seen_in_file: dict[str, int] = {}

    valid_count = 0
    error_count = 0
    duplicate_count = 0

    for index, record in enumerate(records):
        row_number = index + 2
        validated, issues = validate_row(
            row_number=row_number,
            record=record,
            class_by_name=class_by_name,
        )

        if issues:
            error_count += 1
            errors.extend(issues)
            staging_rows.append(
                (
                    job_id,
                    row_number,
                    json.dumps(record),
                    "",
                    "error",
                    json.dumps(issues),
                )
            )
            continue

        assert validated is not None
        fingerprint = validated["fingerprint"]
        payload = validated["payload"]
        status = "valid"
        row_issues: list[dict[str, Any]] = []

        if fingerprint in seen_in_file:
            status = "duplicate_in_file"
            duplicate_count += 1
            row_issues.append({
                "row": row_number,
                "field": "name",
                "code": "DUPLICATE_IN_FILE",
                "message": f"Duplicate of row {seen_in_file[fingerprint]}.",
                "matched_row": seen_in_file[fingerprint],
            })
            duplicates.append({
                "row": row_number,
                "type": "in_file",
                "matched_row": seen_in_file[fingerprint],
                "fingerprint": fingerprint,
                "message": f"Same student as row {seen_in_file[fingerprint]}.",
            })
        elif fingerprint in existing_fingerprints:
            status = "duplicate_existing"
            duplicate_count += 1
            row_issues.append({
                "row": row_number,
                "field": "name",
                "code": "DUPLICATE_EXISTING",
                "message": "A matching student is already registered.",
            })
            duplicates.append({
                "row": row_number,
                "type": "existing",
                "fingerprint": fingerprint,
                "message": "A matching student is already registered in your school.",
            })
        else:
            seen_in_file[fingerprint] = row_number
            valid_count += 1

        staging_rows.append(
            (
                job_id,
                row_number,
                json.dumps(payload),
                fingerprint,
                status,
                json.dumps(row_issues),
            )
        )

    async with conn.transaction():
        await conn.execute(
            """
            INSERT INTO student_import_jobs (
              id, school_id, imported_by, filename, total_rows,
              valid_count, error_count, duplicate_count, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'preview')
            """,
            job_id,
            school_id,
            actor_id,
            filename,
            len(records),
            valid_count,
            error_count,
            duplicate_count,
        )

        await conn.executemany(
            """
            INSERT INTO student_import_staging (
              job_id, row_number, payload, fingerprint, status, issues
            ) VALUES ($1, $2, $3::jsonb, $4, $5, $6::jsonb)
            """,
            staging_rows,
        )

    sample_valid = [
        json.loads(row[2])
        for row in staging_rows
        if row[4] == "valid"
    ][:5]

    return {
        "job_id": str(job_id),
        "total_rows": len(records),
        "valid_count": valid_count,
        "error_count": error_count,
        "duplicate_count": duplicate_count,
        "can_confirm": valid_count > 0 or duplicate_count > 0,
        "errors": errors[:100],
        "duplicates": duplicates[:100],
        "sample_valid_rows": sample_valid,
    }


async def confirm_import(
    conn: asyncpg.Connection,
    *,
    school_id: uuid.UUID,
    actor_id: uuid.UUID,
    job_id: uuid.UUID,
    duplicate_strategy: DuplicateStrategy,
) -> dict[str, Any]:
    job = await conn.fetchrow(
        """
        SELECT id, school_id, filename, status, expires_at
        FROM student_import_jobs
        WHERE id = $1 AND school_id = $2
        LIMIT 1
        """,
        job_id,
        school_id,
    )
    if not job:
        raise ValueError("Import job not found.")
    if job["status"] != "preview":
        raise ValueError("This import has already been processed.")
    if job["expires_at"] and job["expires_at"] < datetime.now(timezone.utc):
        await conn.execute(
            "UPDATE student_import_jobs SET status = 'expired' WHERE id = $1",
            job_id,
        )
        raise ValueError("Import preview has expired. Upload the file again.")

    allowed_statuses = ("valid",)
    if duplicate_strategy == "import_all":
        allowed_statuses = ("valid", "duplicate_in_file", "duplicate_existing")

    rows = await conn.fetch(
        """
        SELECT row_number, payload, status
        FROM student_import_staging
        WHERE job_id = $1 AND status = ANY($2::text[])
        ORDER BY row_number ASC
        """,
        job_id,
        list(allowed_statuses),
    )

    if duplicate_strategy == "skip":
        rows = [row for row in rows if row["status"] == "valid"]

    if not rows:
        raise ValueError("No rows available to import with the selected options.")

    learner_ids = await allocate_learner_ids(conn, school_id, len(rows))
    school_slug = await conn.fetchval("SELECT slug FROM schools WHERE id = $1 LIMIT 1", school_id)
    imported = 0
    skipped = 0

    async with conn.transaction():
        for index, row in enumerate(rows):
            payload = row["payload"]
            if isinstance(payload, str):
                payload = json.loads(payload)

            student_id = uuid.uuid4()
            class_id = uuid.UUID(str(payload["class_id"]))
            dob_raw = payload.get("date_of_birth")
            dob = date.fromisoformat(dob_raw) if dob_raw else None
            learner_id = learner_ids[index]

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
                payload["full_name"],
                dob,
                payload.get("gender"),
                class_id,
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
                payload["guardian_name"],
                payload.get("guardian_phone"),
                payload.get("guardian_email"),
                payload.get("guardian_relationship", "parent"),
            )

            await conn.execute(
                """
                INSERT INTO student_class_history (
                  id, school_id, student_id, class_id, enrolled_at, reason, moved_by
                ) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), 'csv_import', $4)
                """,
                school_id,
                student_id,
                class_id,
                actor_id,
            )

            await provision_learner_account(
                conn,
                school_id=school_id,
                school_slug=str(school_slug),
                student_id=student_id,
                learner_id=learner_id,
                full_name=payload["full_name"],
                created_by=actor_id,
            )
            imported += 1

        total_staging = await conn.fetchval(
            "SELECT COUNT(*)::int FROM student_import_staging WHERE job_id = $1",
            job_id,
        )
        skipped = int(total_staging or 0) - imported

        log_status = "complete" if skipped == 0 else "partial"
        await conn.execute(
            """
            INSERT INTO student_import_logs (
              id, school_id, imported_by, filename, total_rows, imported, failed, status, errors
            )
            SELECT $1, school_id, imported_by, filename, total_rows, $2, $3, $4, '[]'::jsonb
            FROM student_import_jobs WHERE id = $5
            """,
            uuid.uuid4(),
            imported,
            skipped,
            log_status,
            job_id,
        )

        await conn.execute(
            """
            UPDATE student_import_jobs
            SET status = 'committed', valid_count = $2
            WHERE id = $1
            """,
            job_id,
            imported,
        )

    return {
        "imported": imported,
        "skipped": skipped,
        "duplicate_strategy": duplicate_strategy,
        "job_id": str(job_id),
        "message": f"{imported} students imported successfully.",
    }
