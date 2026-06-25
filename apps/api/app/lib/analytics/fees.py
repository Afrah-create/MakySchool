from __future__ import annotations

import uuid
from typing import Any

import asyncpg

from app.lib.teacher_assignments import format_class_name, get_current_term_id


async def build_fees_analytics(
    conn: asyncpg.Connection,
    school_id: uuid.UUID,
) -> dict[str, Any]:
    term_id = await get_current_term_id(conn, school_id)

    by_class_rows = await conn.fetch(
        """
        SELECT
          c.id AS class_id,
          c.level,
          c.stream,
          COALESCE(SUM(sfa.amount_owed), 0)::bigint AS amount_owed,
          COALESCE(SUM(sfa.amount_paid), 0)::bigint AS amount_paid
        FROM school_classes c
        LEFT JOIN students st ON st.current_class_id = c.id AND st.status = 'active'
        LEFT JOIN student_fee_accounts sfa ON sfa.student_id = st.id AND sfa.school_id = c.school_id
        LEFT JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
        WHERE c.school_id = $1
          AND ($2::uuid IS NULL OR fs.term_id IS NOT DISTINCT FROM $2::uuid OR fs.id IS NULL)
        GROUP BY c.id, c.level, c.stream
        ORDER BY c.level ASC, COALESCE(c.stream, '') ASC
        """,
        school_id,
        term_id,
    )

    by_class = []
    total_owed = 0
    total_paid = 0
    for row in by_class_rows:
        owed = int(row["amount_owed"] or 0)
        paid = int(row["amount_paid"] or 0)
        total_owed += owed
        total_paid += paid
        rate = round((paid / owed) * 100, 1) if owed > 0 else 0.0
        by_class.append(
            {
                "classId": str(row["class_id"]),
                "className": format_class_name(row["level"], row["stream"]),
                "amountOwed": owed,
                "amountPaid": paid,
                "collectionRatePercent": rate,
            }
        )

    outstanding_row = await conn.fetchrow(
        """
        SELECT
          COALESCE(SUM(balance), 0)::bigint AS outstanding,
          COUNT(*) FILTER (WHERE balance > 0)::int AS accounts_with_balance
        FROM student_fee_accounts
        WHERE school_id = $1
        """,
        school_id,
    )

    trend_rows = await conn.fetch(
        """
        SELECT
          date_trunc('week', payment_date)::date AS week_start,
          COALESCE(SUM(amount), 0)::bigint AS total
        FROM fee_payments
        WHERE school_id = $1 AND voided = false
        GROUP BY 1
        ORDER BY 1 ASC
        LIMIT 12
        """,
        school_id,
    )

    return {
        "termId": str(term_id) if term_id else None,
        "summary": {
            "amountOwed": total_owed,
            "amountPaid": total_paid,
            "collectionRatePercent": round((total_paid / total_owed) * 100, 1)
            if total_owed > 0
            else 0.0,
            "outstandingBalance": int(outstanding_row["outstanding"]) if outstanding_row else 0,
            "accountsWithBalance": int(outstanding_row["accounts_with_balance"])
            if outstanding_row
            else 0,
        },
        "byClass": by_class,
        "weeklyPaymentTrend": [
            {
                "weekStart": row["week_start"].isoformat(),
                "total": int(row["total"]),
            }
            for row in trend_rows
        ],
    }
