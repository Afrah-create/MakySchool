import bcrypt from "bcrypt";
import { Router } from "express";
import { CLIENT_APP_HEADER, TENANT_HEADERS } from "@makyschool/shared/constants";
import type { ClientAppKind } from "@makyschool/shared/constants";
import { USER_DISPLAY_NAME_SQL, normalizeUserRole } from "../../db/userSql.js";
import { pool } from "../../db/pool.js";
import { getCookie } from "../../utils/http.js";
import {
  SUPERADMIN_ACCESS_COOKIE,
  SUPERADMIN_REFRESH_COOKIE,
  TENANT_ACCESS_COOKIE,
  TENANT_REFRESH_COOKIE,
  cookieOptions,
  signTenantToken,
  verifySuperAdminToken,
  verifyTenantToken,
} from "../../utils/auth.js";
import { authenticateSuperAdmin, isSuperAdminEmail } from "../../utils/platformLogin.js";

export const authRouter = Router();

type SchoolRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  subscription_status: string;
};

function resolveClientApp(req: import("express").Request): ClientAppKind {
  const header = req.header(CLIENT_APP_HEADER)?.trim().toLowerCase();
  return header === "platform" ? "platform" : "tenant";
}

function platformAppUrl() {
  return (process.env.PLATFORM_APP_URL ?? "http://localhost:3001").replace(/\/$/, "");
}

function resolveSchoolRedirectPath(
  isTempPassword: boolean,
  setupCompleted: boolean,
) {
  if (isTempPassword) {
    return "/auth/change-password";
  }
  if (!setupCompleted) {
    return "/dashboard/setup";
  }
  return "/dashboard";
}

function clearAuthCookies(res: import("express").Response) {
  res.clearCookie(SUPERADMIN_ACCESS_COOKIE, { path: "/" });
  res.clearCookie(SUPERADMIN_REFRESH_COOKIE, { path: "/" });
  res.clearCookie(TENANT_ACCESS_COOKIE, { path: "/" });
  res.clearCookie(TENANT_REFRESH_COOKIE, { path: "/" });
}

authRouter.post("/login", async (req, res) => {
  const { email, password, schoolSlug: bodySlug } = req.body as {
    email?: string;
    password?: string;
    schoolSlug?: string;
  };

  if (!email?.trim() || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const headerSlug = req.header(TENANT_HEADERS.SCHOOL_SLUG)?.trim().toLowerCase();
  const requestedSlug = (bodySlug ?? headerSlug)?.trim().toLowerCase() || null;

  clearAuthCookies(res);

  const clientApp = resolveClientApp(req);

  if (clientApp === "platform") {
    const result = await authenticateSuperAdmin(normalizedEmail, password, res);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.json({ data: result.data });
  }

  if (await isSuperAdminEmail(normalizedEmail)) {
    return res.status(403).json({
      error: "Platform administrator accounts must sign in on the platform console.",
      code: "PLATFORM_ACCOUNT",
      redirectUrl: `${platformAppUrl()}/login`,
    });
  }

  const userCandidates = await pool.query<{
    id: string;
    email: string;
    password_hash: string;
    name: string;
    role: string;
    school_id: string;
    school_slug: string;
    school_name: string;
    school_status: string;
    subscription_status: string;
    account_status: string;
    is_temp_password: boolean | null;
    setup_completed: boolean | null;
  }>(
    `SELECT
       u.id,
       u.email,
       u.password_hash,
       ${USER_DISPLAY_NAME_SQL} AS name,
       u.role,
       u.school_id,
       u.account_status,
       COALESCE(u.is_temp_password, false) AS is_temp_password,
       COALESCE(u.setup_completed, false) AS setup_completed,
       s.slug AS school_slug,
       s.name AS school_name,
       s.status AS school_status,
       s.subscription_status
     FROM users u
     INNER JOIN schools s ON s.id = u.school_id
     WHERE LOWER(u.email) = LOWER($1)
       AND u.password_hash IS NOT NULL
     ORDER BY s.name ASC`,
    [normalizedEmail],
  );

  if (!userCandidates.rowCount) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  let candidate = userCandidates.rows[0];

  if (userCandidates.rowCount > 1) {
    if (!requestedSlug) {
      return res.status(400).json({
        error: "Multiple schools found for this email. Enter your school slug to continue.",
        code: "SCHOOL_SLUG_REQUIRED",
      });
    }

    const matched = userCandidates.rows.find((row) => row.school_slug === requestedSlug);
    if (!matched) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    candidate = matched;
  } else if (requestedSlug && candidate.school_slug !== requestedSlug) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const isValid = await bcrypt.compare(password, candidate.password_hash);
  if (!isValid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  if (candidate.account_status && candidate.account_status !== "ACTIVE") {
    return res.status(403).json({
      error: "Your account has been deactivated. Contact your school administrator.",
      code: "ACCOUNT_INACTIVE",
    });
  }

  if (candidate.school_status === "suspended") {
    return res.status(403).json({
      error: "This school account is suspended. Contact MakySchool support.",
      code: "SCHOOL_SUSPENDED",
    });
  }

  const normalizedRole = normalizeUserRole(candidate.role);
  const school: SchoolRow = {
    id: candidate.school_id,
    slug: candidate.school_slug,
    name: candidate.school_name,
    status: candidate.school_status,
    subscription_status: candidate.subscription_status,
  };

  const isTempPassword = Boolean(candidate.is_temp_password);
  const setupCompleted = Boolean(candidate.setup_completed);

  const payload = {
    sub: candidate.id,
    email: candidate.email,
    name: candidate.name,
    role: normalizedRole as "admin" | "head_teacher" | "teacher" | "learner",
    schoolId: candidate.school_id,
    schoolSlug: candidate.school_slug,
    mustChangePassword: isTempPassword,
    setupCompleted,
  };

  if (isTempPassword) {
    res.cookie(TENANT_ACCESS_COOKIE, signTenantToken(payload, "1h"), cookieOptions(60 * 60 * 1000));
    res.clearCookie(TENANT_REFRESH_COOKIE, { path: "/" });
  } else {
    res.cookie(TENANT_ACCESS_COOKIE, signTenantToken(payload, "15m"), cookieOptions(15 * 60 * 1000));
    res.cookie(TENANT_REFRESH_COOKIE, signTenantToken(payload, "7d"), cookieOptions(7 * 24 * 60 * 60 * 1000));
  }

  return res.json({
    data: {
      accountType: "school" as const,
      role: normalizedRole,
      redirectTo: resolveSchoolRedirectPath(isTempPassword, setupCompleted),
      user: {
        id: candidate.id,
        email: candidate.email,
        name: candidate.name,
        role: normalizedRole,
        school_id: candidate.school_id,
      },
      school,
    },
  });
});

authRouter.get("/me", async (req, res) => {
  const superAdminToken =
    getCookie(req, SUPERADMIN_ACCESS_COOKIE) ?? getCookie(req, SUPERADMIN_REFRESH_COOKIE);

  if (superAdminToken) {
    try {
      const payload = verifySuperAdminToken(superAdminToken);
      const result = await pool.query<{ id: string; email: string; name: string }>(
        "SELECT id, email, name FROM super_admins WHERE id = $1 LIMIT 1",
        [payload.sub],
      );
      const superAdmin = result.rows[0];
      if (!superAdmin) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      return res.json({
        data: {
          accountType: "platform" as const,
          role: "super_admin" as const,
          user: superAdmin,
        },
      });
    } catch {
      return res.status(401).json({ error: "Not authenticated" });
    }
  }

  const tenantToken =
    getCookie(req, TENANT_ACCESS_COOKIE) ?? getCookie(req, TENANT_REFRESH_COOKIE);

  if (!tenantToken) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const payload = verifyTenantToken(tenantToken);
    const headerSlug = req.header(TENANT_HEADERS.SCHOOL_SLUG);
    if (headerSlug && payload.schoolSlug !== headerSlug) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const result = await pool.query<{
      id: string;
      email: string;
      name: string;
      role: string;
      school_id: string;
    }>(
      `SELECT
         u.id,
         u.email,
         ${USER_DISPLAY_NAME_SQL} AS name,
         u.role,
         u.school_id
       FROM users u
       WHERE u.id = $1
       LIMIT 1`,
      [payload.sub],
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    return res.json({
      data: {
        accountType: "school" as const,
        role: normalizeUserRole(user.role),
        user: {
          ...user,
          role: normalizeUserRole(user.role),
        },
        school: {
          slug: payload.schoolSlug,
          id: payload.schoolId,
        },
      },
    });
  } catch {
    return res.status(401).json({ error: "Not authenticated" });
  }
});

authRouter.post("/logout", (_req, res) => {
  clearAuthCookies(res);
  return res.json({ data: { ok: true } });
});

// Backward-compatible aliases used by existing client code
export const tenantAuthRouter = authRouter;
