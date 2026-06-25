from __future__ import annotations

import uuid
from typing import Any

import asyncpg

from app.services.fees._common import account_has_transactions, row_dict, rows_list


def serialize_account(row: asyncpg.Record) -> dict[str, Any]:
    data = row_dict(row)
    return {"account": data}


async def list_accounts(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    *,
    account_type: str | None = None,
    active_only: bool = False,
) -> list[dict[str, Any]]:
    conditions = ["school_id = $1"]
    params: list[Any] = [school_id]
    if account_type:
        conditions.append("account_type = $2")
        params.append(account_type)
    if active_only:
        conditions.append("is_active = true")
    where = " AND ".join(conditions)
    rows = await conn.fetch(
        f"""
        SELECT id, code, name, account_type, category, description, is_active, created_at, updated_at
        FROM accounts
        WHERE {where}
        ORDER BY code ASC
        """,
        *params,
    )
    return rows_list(rows)


async def get_account(conn: asyncpg.Connection, school_id: uuid.UUID, account_id: uuid.UUID) -> dict | None:
    row = await conn.fetchrow(
        """
        SELECT id, code, name, account_type, category, description, is_active, created_at, updated_at
        FROM accounts WHERE id = $1 AND school_id = $2 LIMIT 1
        """,
        account_id,
        school_id,
    )
    return row_dict(row)


async def create_account(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    code: str,
    name: str,
    account_type: str,
    category: str | None,
    description: str | None,
) -> dict:
    account_id = uuid.uuid4()
    row = await conn.fetchrow(
        """
        INSERT INTO accounts (id, school_id, code, name, account_type, category, description, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, code, name, account_type, category, description, is_active, created_at, updated_at
        """,
        account_id,
        school_id,
        code.strip(),
        name.strip(),
        account_type,
        category,
        description,
        user_id,
    )
    return serialize_account(row)


async def update_account(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
    account_id: uuid.UUID,
    *,
    code: str | None,
    name: str | None,
    category: str | None,
    description: str | None,
    is_active: bool | None,
) -> dict | None:
    existing = await conn.fetchrow(
        "SELECT id FROM accounts WHERE id = $1 AND school_id = $2 LIMIT 1",
        account_id,
        school_id,
    )
    if not existing:
        return None

    row = await conn.fetchrow(
        """
        UPDATE accounts
        SET code = COALESCE($3, code),
            name = COALESCE($4, name),
            category = COALESCE($5, category),
            description = COALESCE($6, description),
            is_active = COALESCE($7, is_active),
            updated_at = NOW()
        WHERE id = $1 AND school_id = $2
        RETURNING id, code, name, account_type, category, description, is_active, created_at, updated_at
        """,
        account_id,
        school_id,
        code.strip() if code else None,
        name.strip() if name else None,
        category,
        description,
        is_active,
    )
    return serialize_account(row)


async def deactivate_account(conn: asyncpg.Connection, school_id: uuid.UUID, account_id: uuid.UUID) -> dict | None:
    if await account_has_transactions(conn, account_id):
        return None
    row = await conn.fetchrow(
        """
        UPDATE accounts SET is_active = false, updated_at = NOW()
        WHERE id = $1 AND school_id = $2
        RETURNING id, code, name, account_type, category, description, is_active, created_at, updated_at
        """,
        account_id,
        school_id,
    )
    return serialize_account(row) if row else None


async def soft_delete_account(conn: asyncpg.Connection, school_id: uuid.UUID, account_id: uuid.UUID) -> str:
    """Returns 'deactivated', 'not_found', or 'has_transactions'."""
    row = await conn.fetchrow(
        "SELECT id FROM accounts WHERE id = $1 AND school_id = $2 LIMIT 1",
        account_id,
        school_id,
    )
    if not row:
        return "not_found"
    if await account_has_transactions(conn, account_id):
        await conn.execute(
            "UPDATE accounts SET is_active = false, updated_at = NOW() WHERE id = $1",
            account_id,
        )
        return "has_transactions"
    await conn.execute(
        "UPDATE accounts SET is_active = false, updated_at = NOW() WHERE id = $1",
        account_id,
    )
    return "deactivated"
