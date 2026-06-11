import bcrypt from "bcrypt";
import { Router } from "express";
import { pool } from "../../db/pool.js";
import type { TenantRequest } from "../../middleware/tenant.js";
import { getCookie } from "../../utils/http.js";
import {
  TENANT_ACCESS_COOKIE,
  TENANT_REFRESH_COOKIE,
  cookieOptions,
  signTenantToken,
  verifyTenantToken,
} from "../../utils/auth.js";

export const tenantAuthRouter = Router();

// TODO(Ssekyanzi): RBAC, forgot-password, role guards, refresh token rotation

tenantAuthRouter.post("/login", async (req: TenantRequest, res) => {
  const schoolId = req.schoolId;
  const schoolSlug = req.schoolSlug;

  if (!schoolId || !schoolSlug) {
    return res.status(400).json({
      error: "Missing tenant context",
      code: "TENANT_CONTEXT_REQUIRED",
    });
  }

  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const result = await pool.query<{
    id: string;
    email: string;
    password_hash: string;
    name: string;
    role: string;
    school_id: string;
  }>(
    `SELECT id, email, password_hash, name, role, school_id
     FROM users
     WHERE school_id = $1 AND email = $2
     LIMIT 1`,
    [schoolId, email.toLowerCase().trim()],
  );

  const user = result.rows[0];
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role as "admin" | "head_teacher" | "teacher" | "learner",
    schoolId: user.school_id,
    schoolSlug,
  };

  res.cookie(TENANT_ACCESS_COOKIE, signTenantToken(payload, "15m"), cookieOptions(15 * 60 * 1000));
  res.cookie(TENANT_REFRESH_COOKIE, signTenantToken(payload, "7d"), cookieOptions(7 * 24 * 60 * 60 * 1000));

  const schoolResult = await pool.query(
    "SELECT id, slug, name, status, subscription_status FROM schools WHERE id = $1",
    [schoolId],
  );

  return res.json({
    data: {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        school_id: user.school_id,
      },
      school: schoolResult.rows[0] ?? null,
    },
  });
});

tenantAuthRouter.get("/me", async (req: TenantRequest, res) => {
  const token =
    getCookie(req, TENANT_ACCESS_COOKIE) ?? getCookie(req, TENANT_REFRESH_COOKIE);

  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const payload = verifyTenantToken(token);

    if (req.schoolId && payload.schoolId !== req.schoolId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const result = await pool.query<{
      id: string;
      email: string;
      name: string;
      role: string;
      school_id: string;
    }>(
      "SELECT id, email, name, role, school_id FROM users WHERE id = $1 LIMIT 1",
      [payload.sub],
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    return res.json({ data: user });
  } catch {
    return res.status(401).json({ error: "Not authenticated" });
  }
});

tenantAuthRouter.post("/logout", (_req, res) => {
  res.clearCookie(TENANT_ACCESS_COOKIE, { path: "/" });
  res.clearCookie(TENANT_REFRESH_COOKIE, { path: "/" });
  return res.json({ data: { ok: true } });
});
