from __future__ import annotations

import uuid
from typing import Any

import asyncpg
from fastapi.encoders import jsonable_encoder


def row_dict(row: asyncpg.Record | None) -> Any:
    if row is None:
        return None
    return jsonable_encoder(dict(row))


def rows_list(rows: list[asyncpg.Record]) -> list[Any]:
    return [row_dict(row) for row in rows]


async def account_has_transactions(conn: asyncpg.Connection, account_id: uuid.UUID) -> bool:
    ref = await conn.fetchval(
        """
        SELECT EXISTS (
          SELECT 1 FROM invoice_items WHERE account_id = $1
          UNION ALL
          SELECT 1 FROM other_income_items WHERE account_id = $1
          UNION ALL
          SELECT 1 FROM budget_items WHERE account_id = $1
        )
        """,
        account_id,
    )
    return bool(ref)
