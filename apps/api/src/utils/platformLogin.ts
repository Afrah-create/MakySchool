import bcrypt from "bcrypt";
import type { Response } from "express";
import { pool } from "../db/pool.js";
import {
  SUPERADMIN_ACCESS_COOKIE,
  SUPERADMIN_REFRESH_COOKIE,
  cookieOptions,
  signSuperAdminToken,
} from "./auth.js";

export function platformDashboardUrl() {
  const base = (process.env.PLATFORM_APP_URL ?? "http://localhost:3001").replace(/\/$/, "");
  return `${base}/dashboard`;
}

export async function authenticateSuperAdmin(
  email: string,
  password: string,
  res: Response,
) {
  const normalizedEmail = email.toLowerCase().trim();

  const superAdminResult = await pool.query<{
    id: string;
    email: string;
    password_hash: string;
    name: string;
  }>(
    "SELECT id, email, password_hash, name FROM super_admins WHERE LOWER(email) = LOWER($1) LIMIT 1",
    [normalizedEmail],
  );

  const superAdmin = superAdminResult.rows[0];
  if (!superAdmin) {
    return { ok: false as const, status: 401, error: "Invalid credentials" };
  }

  const isValid = await bcrypt.compare(password, superAdmin.password_hash);
  if (!isValid) {
    return { ok: false as const, status: 401, error: "Invalid credentials" };
  }

  const payload = {
    sub: superAdmin.id,
    email: superAdmin.email,
    name: superAdmin.name,
    role: "super_admin" as const,
  };

  res.cookie(
    SUPERADMIN_ACCESS_COOKIE,
    signSuperAdminToken(payload, "15m"),
    cookieOptions(15 * 60 * 1000),
  );
  res.cookie(
    SUPERADMIN_REFRESH_COOKIE,
    signSuperAdminToken(payload, "7d"),
    cookieOptions(7 * 24 * 60 * 60 * 1000),
  );

  return {
    ok: true as const,
    data: {
      accountType: "platform" as const,
      role: "super_admin" as const,
      redirectTo: platformDashboardUrl(),
      user: {
        id: superAdmin.id,
        email: superAdmin.email,
        name: superAdmin.name,
      },
    },
  };
}

export async function isSuperAdminEmail(email: string) {
  const normalizedEmail = email.toLowerCase().trim();
  const result = await pool.query<{ id: string }>(
    "SELECT id FROM super_admins WHERE LOWER(email) = LOWER($1) LIMIT 1",
    [normalizedEmail],
  );
  return Boolean(result.rowCount);
}
