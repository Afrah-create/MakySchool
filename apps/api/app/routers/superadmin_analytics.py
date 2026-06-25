from __future__ import annotations

from datetime import datetime, timezone

import asyncpg
from fastapi import APIRouter, Depends
from fastapi.encoders import jsonable_encoder

from app.db.pool import get_db
from app.middleware.auth import get_current_superadmin

router = APIRouter(dependencies=[Depends(get_current_superadmin)])


@router.get("")
async def superadmin_analytics(
    conn: asyncpg.Connection = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    current_year = now.year

    status_rows = await conn.fetch(
        """
        SELECT status, COUNT(*)::int AS count
        FROM schools
        GROUP BY status
        ORDER BY status ASC
        """
    )
    schools_by_status = {row["status"]: row["count"] for row in status_rows}
    total_schools = sum(schools_by_status.values())

    revenue_row = await conn.fetchrow(
        """
        SELECT COALESCE(SUM(amount), 0)::bigint AS total
        FROM subscription_payments
        WHERE year = $1
        """,
        current_year,
    )

    term_revenue_rows = await conn.fetch(
        """
        SELECT term, COALESCE(SUM(amount), 0)::bigint AS total
        FROM subscription_payments
        WHERE year = $1
        GROUP BY term
        ORDER BY term ASC
        """,
        current_year,
    )

    return {
        "data": jsonable_encoder(
            {
                "schools": {
                    "total": total_schools,
                    "byStatus": schools_by_status,
                    "active": schools_by_status.get("active", 0),
                    "setup": schools_by_status.get("setup", 0),
                },
                "revenue": {
                    "year": current_year,
                    "totalThisYear": int(revenue_row["total"]) if revenue_row else 0,
                    "byTerm": {row["term"]: int(row["total"]) for row in term_revenue_rows},
                },
            }
        )
    }
