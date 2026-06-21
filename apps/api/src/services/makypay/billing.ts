import { SUBSCRIPTION_FEE_UGX, UGANDA_TERMS } from "@makyschool/shared/constants";
import { pool } from "../../db/pool.js";

export function resolveBillingPeriod(
  subscriptionTerm: string | null | undefined,
  subscriptionYear: number | null | undefined,
) {
  const year = subscriptionYear ?? new Date().getFullYear();
  if (subscriptionTerm) {
    return { term: subscriptionTerm, year };
  }

  const month = new Date().getMonth();
  let term: (typeof UGANDA_TERMS)[number] = UGANDA_TERMS[0];
  if (month >= 4 && month <= 7) {
    term = UGANDA_TERMS[1];
  } else if (month >= 8) {
    term = UGANDA_TERMS[2];
  }

  return { term, year };
}

export async function fulfillSubscriptionPayment(params: {
  schoolId: string;
  reference: string;
  externalRef: string;
  amount: number;
  term: string;
  year: number;
}) {
  const { schoolId, reference, externalRef, amount, term, year } = params;

  const pending = await pool.query<{
    id: string;
    status: string;
    school_id: string;
  }>(
    `SELECT id, status, school_id
     FROM subscription_payments
     WHERE payment_reference = $1
     LIMIT 1`,
    [reference],
  );

  const row = pending.rows[0];
  if (row?.status === "completed") {
    return "already_completed" as const;
  }

  const duplicateExternal = await pool.query(
    "SELECT 1 FROM subscription_payments WHERE schoolpay_ref = $1 AND status = 'completed' LIMIT 1",
    [externalRef],
  );
  if (duplicateExternal.rowCount) {
    return "already_completed" as const;
  }

  if (amount > 0 && amount !== SUBSCRIPTION_FEE_UGX) {
    throw new Error("Unexpected payment amount");
  }

  await pool.query("BEGIN");
  try {
    if (row) {
      await pool.query(
        `UPDATE subscription_payments
         SET status = 'completed',
             schoolpay_ref = $1,
             paid_at = NOW(),
             amount = $2
         WHERE id = $3`,
        [externalRef, amount || SUBSCRIPTION_FEE_UGX, row.id],
      );
    } else {
      await pool.query(
        `INSERT INTO subscription_payments (
           id, school_id, amount, term, year, schoolpay_ref,
           status, payment_reference, provider, paid_at
         ) VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7, 'makypay', NOW())`,
        [
          crypto.randomUUID(),
          schoolId,
          amount || SUBSCRIPTION_FEE_UGX,
          term,
          year,
          externalRef,
          reference,
        ],
      );
    }

    await pool.query(
      `UPDATE schools
       SET subscription_status = 'active', subscription_term = $1, subscription_year = $2
       WHERE id = $3`,
      [term, year, schoolId],
    );

    await pool.query("COMMIT");
    return "completed" as const;
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

export async function markPaymentFailed(reference: string) {
  await pool.query(
    `UPDATE subscription_payments
     SET status = 'failed'
     WHERE payment_reference = $1 AND status = 'pending'`,
    [reference],
  );
}
