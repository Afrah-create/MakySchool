import bcrypt from "bcrypt";
import { Router } from "express";
import { pool } from "../../db/pool.js";
import { getCookie } from "../../utils/http.js";
import {
  SUPERADMIN_ACCESS_COOKIE,
  SUPERADMIN_REFRESH_COOKIE,
  cookieOptions,
  signSuperAdminToken,
  verifySuperAdminToken,
} from "../../utils/auth.js";

export const superAdminAuthRouter = Router();

superAdminAuthRouter.post("/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const result = await pool.query<{
    id: string;
    email: string;
    password_hash: string;
    name: string;
  }>("SELECT id, email, password_hash, name FROM super_admins WHERE email = $1 LIMIT 1", [email.toLowerCase().trim()]);

  const superAdmin = result.rows[0];
  if (!superAdmin) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const isValid = await bcrypt.compare(password, superAdmin.password_hash);
  if (!isValid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const payload = {
    sub: superAdmin.id,
    email: superAdmin.email,
    name: superAdmin.name,
    role: "super_admin" as const,
  };

  res.cookie(SUPERADMIN_ACCESS_COOKIE, signSuperAdminToken(payload, "15m"), cookieOptions(15 * 60 * 1000));
  res.cookie(SUPERADMIN_REFRESH_COOKIE, signSuperAdminToken(payload, "7d"), cookieOptions(7 * 24 * 60 * 60 * 1000));

  return res.json({
    data: {
      id: superAdmin.id,
      email: superAdmin.email,
      name: superAdmin.name,
    },
  });
});

superAdminAuthRouter.get("/me", async (req, res) => {
  const token = getCookie(req, SUPERADMIN_ACCESS_COOKIE) ?? getCookie(req, SUPERADMIN_REFRESH_COOKIE);
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const payload = verifySuperAdminToken(token);
    const result = await pool.query<{ id: string; email: string; name: string }>(
      "SELECT id, email, name FROM super_admins WHERE id = $1 LIMIT 1",
      [payload.sub],
    );
    const superAdmin = result.rows[0];
    if (!superAdmin) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    return res.json({ data: superAdmin });
  } catch {
    return res.status(401).json({ error: "Not authenticated" });
  }
});

superAdminAuthRouter.post("/logout", (_req, res) => {
  res.clearCookie(SUPERADMIN_ACCESS_COOKIE, { path: "/" });
  res.clearCookie(SUPERADMIN_REFRESH_COOKIE, { path: "/" });
  return res.json({ data: { ok: true } });
});