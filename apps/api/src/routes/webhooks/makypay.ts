import { createHmac, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { SUBSCRIPTION_FEE_UGX } from "@makyschool/shared/constants";
import { pool } from "../../db/pool.js";
import {
  fulfillSubscriptionPayment,
  markPaymentFailed,
  resolveBillingPeriod,
} from "../../services/makypay/billing.js";

export const makyPayWebhookRouter = Router();

function verifyWebhookSecret(req: import("express").Request) {
  const secret = process.env.MAKYWIRE_WEBHOOK_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const signature =
    req.header("x-makywire-signature") ??
    req.header("x-webhook-signature") ??
    req.header("x-makypay-signature");

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

function extractAmount(rawPayload: Record<string, unknown>) {
  const transaction = rawPayload.transaction as Record<string, unknown> | undefined;
  const amountField = transaction?.amount as Record<string, unknown> | undefined;
  const raw =
    amountField?.raw ??
    transaction?.amount ??
    rawPayload.amount ??
    rawPayload.amount_paid ??
    0;

  return Number(raw);
}

makyPayWebhookRouter.post("/", async (req, res) => {
  if (!verifyWebhookSecret(req)) {
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  const rawPayload = (req.body ?? {}) as Record<string, unknown>;
  const eventType = String(rawPayload.event_type ?? "");
  const transaction = (rawPayload.transaction ?? {}) as Record<string, unknown>;
  const reference = String(transaction.reference ?? rawPayload.reference ?? "");
  const transactionId = String(transaction.uuid ?? transaction.id ?? rawPayload.transaction_id ?? "");

  const logResult = await pool.query<{ id: string }>(
    `INSERT INTO webhook_logs (id, source, payload, headers)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)
     RETURNING id`,
    [
      crypto.randomUUID(),
      "makypay",
      JSON.stringify(rawPayload),
      JSON.stringify(req.headers),
    ],
  );

  res.status(200).json({ data: { ok: true } });

  setImmediate(async () => {
    if (!reference) {
      return;
    }

    const paymentResult = await pool.query<{
      school_id: string;
      term: string;
      year: number;
      status: string;
    }>(
      `SELECT school_id, term, year, status
       FROM subscription_payments
       WHERE payment_reference = $1
       LIMIT 1`,
      [reference],
    );

    const payment = paymentResult.rows[0];
    if (!payment) {
      return;
    }

    const normalizedEvent = eventType.toLowerCase();
    const normalizedStatus = String(transaction.status ?? "").toLowerCase();
    const isCompleted =
      normalizedEvent === "collection.completed" || normalizedStatus === "completed";
    const isFailed =
      normalizedEvent === "collection.failed" ||
      normalizedEvent === "collection.cancelled" ||
      normalizedStatus === "failed" ||
      normalizedStatus === "cancelled";

    if (isFailed) {
      await markPaymentFailed(reference);
      await pool.query("UPDATE webhook_logs SET processed_at = NOW() WHERE id = $1", [
        logResult.rows[0].id,
      ]);
      return;
    }

    if (!isCompleted) {
      return;
    }

    const amount = extractAmount(rawPayload);
    const externalRef = transactionId || reference;

    const schoolResult = await pool.query<{
      subscription_term: string | null;
      subscription_year: number | null;
    }>("SELECT subscription_term, subscription_year FROM schools WHERE id = $1 LIMIT 1", [
      payment.school_id,
    ]);

    const school = schoolResult.rows[0];
    const period = resolveBillingPeriod(
      payment.term || school?.subscription_term,
      payment.year || school?.subscription_year,
    );

    try {
      await fulfillSubscriptionPayment({
        schoolId: payment.school_id,
        reference,
        externalRef,
        amount: amount || SUBSCRIPTION_FEE_UGX,
        term: period.term,
        year: period.year,
      });
      await pool.query("UPDATE webhook_logs SET processed_at = NOW() WHERE id = $1", [
        logResult.rows[0].id,
      ]);
    } catch {
      // Logged in webhook_logs; reconciliation can retry via poll endpoint.
    }
  });
});
