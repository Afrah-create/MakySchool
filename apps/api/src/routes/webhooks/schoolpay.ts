import { Router } from "express";
import { pool } from "../../db/pool.js";

export const schoolPayWebhookRouter = Router();

schoolPayWebhookRouter.post("/", async (req, res) => {
  const rawPayload = req.body ?? {};

  await pool.query(
    `INSERT INTO webhook_logs (id, source, payload, headers)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
    [
      crypto.randomUUID(),
      "schoolpay",
      JSON.stringify(rawPayload),
      JSON.stringify(req.headers),
    ],
  );

  res.status(200).json({ data: { ok: true } });

  setImmediate(async () => {
    const schoolpayCode = String(rawPayload.schoolpay_code ?? rawPayload.code ?? rawPayload.merchant_code ?? "");
    const ref = String(rawPayload.reference ?? rawPayload.transaction_id ?? crypto.randomUUID());
    const amount = Number(rawPayload.amount ?? rawPayload.amount_paid ?? 0);
    const term = String(rawPayload.term ?? "Term 1");
    const year = Number(rawPayload.year ?? new Date().getFullYear());

    if (!schoolpayCode) {
      return;
    }

    const schoolResult = await pool.query("SELECT id FROM schools WHERE schoolpay_code = $1 LIMIT 1", [schoolpayCode]);
    const school = schoolResult.rows[0];
    if (!school) {
      return;
    }

    await pool.query("BEGIN");
    try {
      await pool.query(
        `INSERT INTO subscription_payments (id, school_id, amount, term, year, schoolpay_ref)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [crypto.randomUUID(), school.id, amount, term, year, ref],
      );
      await pool.query(
        `UPDATE schools
         SET subscription_status = 'active', subscription_term = $1, subscription_year = $2
         WHERE id = $3`,
        [term, year, school.id],
      );
      await pool.query("UPDATE webhook_logs SET processed_at = NOW() WHERE source = 'schoolpay' AND payload->>'reference' = $1", [ref]);
      await pool.query("COMMIT");
    } catch {
      await pool.query("ROLLBACK");
    }
  });
});