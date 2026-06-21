import type { NextFunction, Response } from "express";
import { Router } from "express";
import { pool } from "../../db/pool.js";
import type { AuthenticatedTenantRequest } from "../../middleware/tenantAuth.js";
import {
  fulfillSubscriptionPayment,
  markPaymentFailed,
  resolveBillingPeriod,
} from "../../services/makypay/billing.js";
import { collectMobileMoney, getTransaction, makypayConfigured } from "../../services/makypay/client.js";
import { normalizeUgandaPhone } from "../../services/makypay/phone.js";
import { getSubscriptionFeeUgx } from "../../services/platformSettings.js";

export const schoolBillingRouter = Router();

function requireSchoolAdmin(
  req: AuthenticatedTenantRequest,
  res: Response,
  next: NextFunction,
) {
  if (req.tenantUser?.role !== "admin") {
    return res.status(403).json({
      error: "Only school administrators can manage billing",
      code: "FORBIDDEN",
    });
  }

  return next();
}

schoolBillingRouter.use(requireSchoolAdmin);

function callbackUrl() {
  const configured = process.env.MAKYWIRE_CALLBACK_URL?.trim();
  if (configured) {
    return configured;
  }

  const apiUrl = (process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`).replace(/\/$/, "");
  return `${apiUrl}/api/webhooks/makypay`;
}

schoolBillingRouter.get("/quote", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  if (!schoolId) {
    return res.status(400).json({ error: "Missing tenant context" });
  }

  const result = await pool.query<{
    subscription_status: string;
    subscription_term: string | null;
    subscription_year: number | null;
    phone: string | null;
  }>(
    `SELECT subscription_status, subscription_term, subscription_year, phone
     FROM schools WHERE id = $1 LIMIT 1`,
    [schoolId],
  );

  const school = result.rows[0];
  if (!school) {
    return res.status(404).json({ error: "School not found" });
  }

  const period = resolveBillingPeriod(school.subscription_term, school.subscription_year);
  const subscriptionFeeUgx = await getSubscriptionFeeUgx();

  return res.json({
    data: {
      amount: subscriptionFeeUgx,
      currency: "UGX",
      term: period.term,
      year: period.year,
      subscription_status: school.subscription_status,
      phone_hint: school.phone,
      configured: makypayConfigured(),
    },
  });
});

schoolBillingRouter.post("/collect", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  if (!schoolId) {
    return res.status(400).json({ error: "Missing tenant context" });
  }

  if (!makypayConfigured()) {
    return res.status(503).json({
      error: "Mobile money payments are not configured yet. Contact platform support.",
      code: "PAYMENTS_NOT_CONFIGURED",
    });
  }

  const { phone_number: rawPhone } = req.body as { phone_number?: string };
  const phoneNumber = rawPhone ? normalizeUgandaPhone(rawPhone) : null;

  if (!phoneNumber) {
    return res.status(400).json({
      error: "Enter a valid MTN or Airtel number (e.g. 0700 000 000)",
      code: "INVALID_PHONE",
    });
  }

  const schoolResult = await pool.query<{
    name: string;
    subscription_status: string;
    subscription_term: string | null;
    subscription_year: number | null;
  }>(
    `SELECT name, subscription_status, subscription_term, subscription_year
     FROM schools WHERE id = $1 LIMIT 1`,
    [schoolId],
  );

  const school = schoolResult.rows[0];
  if (!school) {
    return res.status(404).json({ error: "School not found" });
  }

  if (school.subscription_status === "active") {
    return res.status(400).json({
      error: "Your subscription is already active for this term",
      code: "ALREADY_ACTIVE",
    });
  }

  const pending = await pool.query(
    `SELECT 1 FROM subscription_payments
     WHERE school_id = $1 AND status = 'pending' AND created_at > NOW() - INTERVAL '15 minutes'
     LIMIT 1`,
    [schoolId],
  );

  if (pending.rowCount) {
    return res.status(409).json({
      error: "A payment is already in progress. Check your phone or wait a few minutes.",
      code: "PAYMENT_IN_PROGRESS",
    });
  }

  const period = resolveBillingPeriod(school.subscription_term, school.subscription_year);
  const subscriptionFeeUgx = await getSubscriptionFeeUgx();
  const reference = crypto.randomUUID();
  const description = `MakySchool subscription — ${school.name} (${period.term} ${period.year})`;

  await pool.query(
    `INSERT INTO subscription_payments (
       id, school_id, amount, term, year, status, payment_reference, provider
     ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, 'makypay')`,
    [
      crypto.randomUUID(),
      schoolId,
      subscriptionFeeUgx,
      period.term,
      period.year,
      reference,
    ],
  );

  try {
    const collection = await collectMobileMoney({
      phoneNumber,
      amount: subscriptionFeeUgx,
      reference,
      description,
      callbackUrl: callbackUrl(),
    });

    if (collection.transactionId) {
      await pool.query(
        `UPDATE subscription_payments
         SET provider_transaction_id = $1
         WHERE payment_reference = $2`,
        [collection.transactionId, reference],
      );
    }

    return res.status(201).json({
      data: {
        reference,
        status: "processing",
        message: "Approve the payment on your phone to continue.",
        phone_number: phoneNumber,
      },
    });
  } catch (error) {
    await markPaymentFailed(reference);
    const message = error instanceof Error ? error.message : "Failed to start mobile money payment";
    return res.status(502).json({ error: message, code: "PAYMENT_INIT_FAILED" });
  }
});

schoolBillingRouter.get("/payments/:reference", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  const reference = String(req.params.reference ?? "");

  if (!reference) {
    return res.status(400).json({ error: "Payment reference is required" });
  }

  if (!schoolId) {
    return res.status(400).json({ error: "Missing tenant context" });
  }

  const paymentResult = await pool.query<{
    status: string;
    provider_transaction_id: string | null;
    term: string;
    year: number;
    school_id: string;
    amount: number;
  }>(
    `SELECT status, provider_transaction_id, term, year, school_id, amount
     FROM subscription_payments
     WHERE payment_reference = $1 AND school_id = $2
     LIMIT 1`,
    [reference, schoolId],
  );

  const payment = paymentResult.rows[0];
  if (!payment) {
    return res.status(404).json({ error: "Payment not found" });
  }

  const schoolResult = await pool.query<{ subscription_status: string }>(
    "SELECT subscription_status FROM schools WHERE id = $1 LIMIT 1",
    [schoolId],
  );
  const subscriptionStatus = schoolResult.rows[0]?.subscription_status ?? "unpaid";

  if (payment.status === "completed" || subscriptionStatus === "active") {
    return res.json({
      data: {
        reference,
        status: "completed",
        subscription_status: subscriptionStatus,
      },
    });
  }

  if (payment.status === "failed") {
    return res.json({
      data: {
        reference,
        status: "failed",
        subscription_status: subscriptionStatus,
      },
    });
  }

  if (payment.provider_transaction_id && makypayConfigured()) {
    try {
      const remote = await getTransaction(payment.provider_transaction_id);
      const normalized = remote.status.toLowerCase();

      if (normalized === "completed" || normalized === "success") {
        await fulfillSubscriptionPayment({
          schoolId: payment.school_id,
          reference,
          externalRef: remote.transactionId,
          amount: remote.amount ?? payment.amount,
          term: payment.term,
          year: payment.year,
          expectedFeeUgx: payment.amount,
        });

        return res.json({
          data: {
            reference,
            status: "completed",
            subscription_status: "active",
          },
        });
      }

      if (normalized === "failed" || normalized === "cancelled") {
        await markPaymentFailed(reference);
        return res.json({
          data: {
            reference,
            status: "failed",
            subscription_status: subscriptionStatus,
          },
        });
      }
    } catch {
      // Fall through to processing response when provider lookup fails.
    }
  }

  return res.json({
    data: {
      reference,
      status: "processing",
      subscription_status: subscriptionStatus,
    },
  });
});
