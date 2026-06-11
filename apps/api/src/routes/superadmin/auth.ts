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

export const superAdminAuthRouter = Router();

function clearAuthCookies(res: import("express").Response) {
  res.clearCookie(SUPERADMIN_ACCESS_COOKIE, { path: "/" });
  res.clearCookie(SUPERADMIN_REFRESH_COOKIE, { path: "/" });
  res.clearCookie(TENANT_ACCESS_COOKIE, { path: "/" });
  res.clearCookie(TENANT_REFRESH_COOKIE, { path: "/" });
}

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

// Deprecated: use POST /api/auth/logout instead.
superAdminAuthRouter.post("/logout", (_req, res) => {
  clearAuthCookies(res);
  return res.json({ data: { ok: true } });
});
