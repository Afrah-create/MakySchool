import bcrypt from "bcrypt";
import { Router } from "express";
import { pool } from "../../db/pool.js";
import { getCookie } from "../../utils/http.js";
import {
  SUPERADMIN_ACCESS_COOKIE,
  SUPERADMIN_REFRESH_COOKIE,
  TENANT_ACCESS_COOKIE,
  TENANT_REFRESH_COOKIE,
  verifySuperAdminToken,
} from "../../utils/auth.js";
import { authenticateSuperAdmin } from "../../utils/platformLogin.js";
import { validatePassword } from "../../utils/password.js";

export const superAdminAuthRouter = Router();

function clearAuthCookies(res: import("express").Response) {
  res.clearCookie(SUPERADMIN_ACCESS_COOKIE, { path: "/" });
  res.clearCookie(SUPERADMIN_REFRESH_COOKIE, { path: "/" });
  res.clearCookie(TENANT_ACCESS_COOKIE, { path: "/" });
  res.clearCookie(TENANT_REFRESH_COOKIE, { path: "/" });
}

superAdminAuthRouter.post("/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email?.trim() || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  clearAuthCookies(res);

  const result = await authenticateSuperAdmin(email, password, res);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }

  return res.json({ data: result.data });
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
  clearAuthCookies(res);
  return res.json({ data: { ok: true } });
});

superAdminAuthRouter.post("/change-password", async (req, res) => {
  const token = getCookie(req, SUPERADMIN_ACCESS_COOKIE) ?? getCookie(req, SUPERADMIN_REFRESH_COOKIE);
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current password and new password are required" });
  }

  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }

  try {
    const payload = verifySuperAdminToken(token);
    const result = await pool.query<{ id: string; password_hash: string }>(
      "SELECT id, password_hash FROM super_admins WHERE id = $1 LIMIT 1",
      [payload.sub],
    );
    const superAdmin = result.rows[0];
    if (!superAdmin) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const isValid = await bcrypt.compare(currentPassword, superAdmin.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.query("UPDATE super_admins SET password_hash = $1 WHERE id = $2", [
      passwordHash,
      superAdmin.id,
    ]);

    return res.json({ data: { ok: true } });
  } catch {
    return res.status(401).json({ error: "Not authenticated" });
  }
});
