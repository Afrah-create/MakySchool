import bcrypt from "bcrypt";
import { Router } from "express";
import { pool } from "../../db/pool.js";
import { USER_DISPLAY_NAME_SQL, normalizeUserRole } from "../../db/userSql.js";
import { requireTenantAuth, type AuthenticatedTenantRequest } from "../../middleware/tenantAuth.js";
import {
  TENANT_ACCESS_COOKIE,
  TENANT_REFRESH_COOKIE,
  cookieOptions,
  signTenantToken,
} from "../../utils/auth.js";

export const changePasswordRouter = Router();

function validateNewPassword(password: string) {
  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (!/\d/.test(password)) {
    return "Password must contain at least one number";
  }
  return null;
}

changePasswordRouter.post("/", requireTenantAuth, async (req: AuthenticatedTenantRequest, res) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current password and new password are required" });
  }

  const passwordError = validateNewPassword(newPassword);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }

  const userId = req.tenantUser?.sub;
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const userResult = await pool.query<{
    id: string;
    email: string;
    name: string;
    role: string;
    school_id: string;
    password_hash: string;
    school_slug: string;
    setup_completed: boolean | null;
  }>(
    `SELECT
       u.id,
       u.email,
       ${USER_DISPLAY_NAME_SQL} AS name,
       u.role,
       u.school_id,
       u.password_hash,
       COALESCE(u.setup_completed, false) AS setup_completed,
       s.slug AS school_slug
     FROM users u
     INNER JOIN schools s ON s.id = u.school_id
     WHERE u.id = $1
     LIMIT 1`,
    [userId],
  );

  const user = userResult.rows[0];
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const isValid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!isValid) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await pool.query(
    `UPDATE users
     SET password_hash = $1, is_temp_password = false, updated_at = NOW()
     WHERE id = $2`,
    [passwordHash, userId],
  );

  const normalizedRole = normalizeUserRole(user.role);
  const setupCompleted = Boolean(user.setup_completed);
  const redirect = setupCompleted ? "/dashboard" : "/dashboard/setup";

  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: normalizedRole as "admin" | "head_teacher" | "teacher" | "learner",
    schoolId: user.school_id,
    schoolSlug: user.school_slug,
    mustChangePassword: false,
    setupCompleted,
  };

  res.cookie(TENANT_ACCESS_COOKIE, signTenantToken(payload, "15m"), cookieOptions(15 * 60 * 1000));
  res.cookie(TENANT_REFRESH_COOKIE, signTenantToken(payload, "7d"), cookieOptions(7 * 24 * 60 * 60 * 1000));

  return res.status(200).json({
    data: {
      redirect,
      schoolSlug: user.school_slug,
    },
  });
});
