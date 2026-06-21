import { subscriptionsEnabled } from "@makyschool/shared/constants";
import type { NextFunction, Response } from "express";
import { pool } from "../db/pool.js";
import type { TenantRequest } from "./tenant.js";

const EXEMPT_PREFIXES = ["/api/schools/setup", "/api/schools/billing"];

export async function requireActiveSubscription(
  req: TenantRequest,
  res: Response,
  next: NextFunction,
) {
  if (!subscriptionsEnabled()) {
    return next();
  }

  if (EXEMPT_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
    return next();
  }

  const schoolId = req.schoolId;
  if (!schoolId) {
    return res.status(400).json({ error: "Missing tenant context" });
  }

  const result = await pool.query<{ status: string; subscription_status: string }>(
    "SELECT status, subscription_status FROM schools WHERE id = $1 LIMIT 1",
    [schoolId],
  );

  const school = result.rows[0];
  if (!school) {
    return res.status(404).json({ error: "School not found" });
  }

  if (school.status === "suspended") {
    return res.status(403).json({ error: "School account is suspended", code: "SCHOOL_SUSPENDED" });
  }

  if (school.status === "setup") {
    return next();
  }

  if (school.subscription_status !== "active") {
    return res.status(402).json({
      error: "Subscription payment required for this term",
      code: "SUBSCRIPTION_REQUIRED",
    });
  }

  return next();
}
