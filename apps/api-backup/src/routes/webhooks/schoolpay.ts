import { createHmac, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { pool } from "../../db/pool.js";

export const schoolPayWebhookRouter = Router();

function verifyWebhookSecret(req: import("express").Request) {
  const secret = process.env.SCHOOLPAY_WEBHOOK_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const signature = req.header("x-schoolpay-signature") ?? req.header("x-webhook-signature");
  if (!signature) {
    return false;
  }

  const payload = JSON.stringify(req.body ?? {});
  const expected = createHmac("sha256", secret).update(payload).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return signature === expected;
  }
}

schoolPayWebhookRouter.post("/", async (req, res) => {
  if (!verifyWebhookSecret(req)) {
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  const rawPayload = req.body ?? {};
  const ref = String(rawPayload.reference ?? rawPayload.transaction_id ?? "");

  const logResult = await pool.query<{ id: string }>(
    `INSERT INTO webhook_logs (id, source, payload, headers)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)
     RETURNING id`,
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
    const amount = Number(rawPayload.amount ?? rawPayload.amount_paid ?? 0);
    const term = String(rawPayload.term ?? "Term 1");
    const year = Number(rawPayload.year ?? new Date().getFullYear());
    const paymentRef = ref || crypto.randomUUID();

    if (!schoolpayCode) {
      return;
    }

    if (ref) {
      const duplicate = await pool.query(
        "SELECT 1 FROM subscription_payments WHERE schoolpay_ref = $1 LIMIT 1",
        [ref],
      );
      if (duplicate.rowCount) {
        await pool.query("UPDATE webhook_logs SET processed_at = NOW() WHERE id = $1", [logResult.rows[0].id]);
        return;
      }
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
        [crypto.randomUUID(), school.id, amount, term, year, paymentRef],
      );
      await pool.query(
        `UPDATE schools
         SET subscription_status = 'active', subscription_term = $1, subscription_year = $2
         WHERE id = $3`,
        [term, year, school.id],
      );
      await pool.query("UPDATE webhook_logs SET processed_at = NOW() WHERE id = $1", [logResult.rows[0].id]);
      await pool.query("COMMIT");
    } catch {
      await pool.query("ROLLBACK");
    }
  });
});
