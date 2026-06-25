import re
import uuid
from datetime import datetime

import asyncpg


def derive_learner_id_prefix(slug: str) -> str:
    parts = [
        re.sub(r"[^a-z0-9]", "", part)
        for part in re.split(r"[-_\s]+", slug.lower())
        if re.sub(r"[^a-z0-9]", "", part)
    ]

    if not parts:
        return "SCH"

    if len(parts) == 1:
        return parts[0][:3].upper().ljust(3, "X")

    if len(parts) == 2 and len(parts[0]) <= 3:
        first = parts[0].upper()
        second_initial = parts[1][0].upper()
        return f"{first}{second_initial}"[:4]

    if len(parts) == 2:
        return parts[0][:3].upper()

    return "".join(part[0].upper() for part in parts)[:4]


async def generate_learner_id(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
) -> str:
    row = await conn.fetchrow(
        "SELECT slug FROM schools WHERE id = $1 LIMIT 1",
        school_id,
    )
    slug = row["slug"] if row else "school"
    prefix = derive_learner_id_prefix(slug)
    year = datetime.now().year

    seq_row = await conn.fetchrow(
        """
        INSERT INTO learner_id_sequences (school_id, prefix, year, next_seq)
        VALUES ($1, $2, $3, 2)
        ON CONFLICT (school_id, year) DO UPDATE
        SET next_seq = learner_id_sequences.next_seq + 1
        RETURNING next_seq - 1 AS issued_seq, prefix
        """,
        school_id,
        prefix,
        year,
    )

    issued_seq = int(seq_row["issued_seq"]) if seq_row else 1
    resolved_prefix = seq_row["prefix"] if seq_row else prefix
    return f"{resolved_prefix}-{year}-{issued_seq:03d}"


async def generate_receipt_number(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
) -> str:
    year = datetime.now().year

    seq_row = await conn.fetchrow(
        """
        INSERT INTO receipt_number_sequences (school_id, year, next_seq)
        VALUES ($1, $2, 2)
        ON CONFLICT (school_id, year) DO UPDATE
        SET next_seq = receipt_number_sequences.next_seq + 1
        RETURNING next_seq - 1 AS issued_seq
        """,
        school_id,
        year,
    )

    seq = int(seq_row["issued_seq"]) if seq_row else 1
    return f"RCP-{year}-{seq:04d}"


async def _next_sequence(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    table: str,
    prefix: str,
) -> str:
    year = datetime.now().year
    seq_row = await conn.fetchrow(
        f"""
        INSERT INTO {table} (school_id, year, next_seq)
        VALUES ($1, $2, 2)
        ON CONFLICT (school_id, year) DO UPDATE
        SET next_seq = {table}.next_seq + 1
        RETURNING next_seq - 1 AS issued_seq
        """,
        school_id,
        year,
    )
    seq = int(seq_row["issued_seq"]) if seq_row else 1
    return f"{prefix}-{year}-{seq:04d}"


async def generate_invoice_number(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
) -> str:
    return await _next_sequence(conn, school_id, table="invoice_number_sequences", prefix="INV")


async def generate_income_reference(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
) -> str:
    return await _next_sequence(conn, school_id, table="income_reference_sequences", prefix="INC")
