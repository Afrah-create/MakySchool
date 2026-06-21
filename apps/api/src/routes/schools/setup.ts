import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { Router } from "express";
import { pool } from "../../db/pool.js";
import { USER_ADMIN_ROLE_SQL, USER_DISPLAY_NAME_SQL, normalizeUserRole } from "../../db/userSql.js";
import type { TenantRequest } from "../../middleware/tenant.js";
import type { AuthenticatedTenantRequest } from "../../middleware/tenantAuth.js";
import {
  TENANT_ACCESS_COOKIE,
  TENANT_REFRESH_COOKIE,
  cookieOptions,
  signTenantToken,
} from "../../utils/auth.js";
import { auditSchoolSubscription } from "../../services/subscriptionTerm.js";

export const schoolSetupRouter = Router();

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const uploadsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../uploads/schools",
);

const upload = multer({
  storage: multer.diskStorage({
    destination: async (req, _file, cb) => {
      const tenantReq = req as TenantRequest;
      const schoolId = tenantReq.schoolId;
      if (!schoolId) {
        cb(new Error("Missing school context"), "");
        return;
      }

      const destination = path.join(uploadsRoot, schoolId);
      await mkdir(destination, { recursive: true });
      cb(null, destination);
    },
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "-");
      cb(null, `${Date.now()}-${safeName}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      cb(new Error("Only JPEG, PNG, and WebP images are allowed"));
      return;
    }
    cb(null, true);
  },
});

schoolSetupRouter.get("/status", async (req: TenantRequest, res) => {
  const schoolId = req.schoolId;
  if (!schoolId) {
    return res.status(400).json({ error: "Missing tenant context" });
  }

  await auditSchoolSubscription(schoolId);

  const [schoolResult, yearResult, gradingResult] = await Promise.all([
    pool.query(
      `SELECT id, slug, name, logo_url, stamp_url, email, phone, address, school_type,
              status, subscription_status, subscription_term, subscription_year,
              schoolpay_code, setup_completed_at, created_at
       FROM schools WHERE id = $1`,
      [schoolId],
    ),
    pool.query("SELECT COUNT(*)::int AS count FROM academic_years WHERE school_id = $1", [schoolId]),
    pool.query("SELECT COUNT(*)::int AS count FROM grading_scales WHERE school_id = $1", [schoolId]),
  ]);

  const school = schoolResult.rows[0];
  const profile = Boolean(school?.name && school?.school_type);
  const academic_year = Number(yearResult.rows[0]?.count ?? 0) > 0;
  const grading_scale = Number(gradingResult.rows[0]?.count ?? 0) > 0;
  const completed = Boolean(school?.setup_completed_at);

  return res.json({
    data: {
      profile,
      academic_year,
      grading_scale,
      completed,
      school: school ?? null,
    },
  });
});

async function saveProfile(req: TenantRequest, res: import("express").Response) {
  const schoolId = req.schoolId;
  if (!schoolId) {
    return res.status(400).json({ error: "Missing tenant context" });
  }

  const body = req.body as Record<string, string>;
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;

  const logoFile = files?.logo?.[0];
  const stampFile = files?.stamp?.[0];

  const logoUrl = logoFile ? `/uploads/schools/${schoolId}/${logoFile.filename}` : null;
  const stampUrl = stampFile ? `/uploads/schools/${schoolId}/${stampFile.filename}` : null;

  const result = await pool.query(
    `UPDATE schools
     SET name = COALESCE($1, name),
         logo_url = COALESCE($2, logo_url),
         stamp_url = COALESCE($3, stamp_url),
         email = COALESCE($4, email),
         phone = COALESCE($5, phone),
         address = COALESCE($6, address),
         school_type = COALESCE($7, school_type)
     WHERE id = $8
     RETURNING *`,
    [
      body.name ?? null,
      logoUrl,
      stampUrl,
      body.email ?? null,
      body.phone ?? null,
      body.address ?? null,
      body.school_type ?? null,
      schoolId,
    ],
  );

  return res.json({ data: result.rows[0] });
}

const profileUpload = upload.fields([
  { name: "logo", maxCount: 1 },
  { name: "stamp", maxCount: 1 },
]);

schoolSetupRouter.post("/profile", profileUpload, (req, res) => void saveProfile(req as TenantRequest, res));
schoolSetupRouter.patch("/profile", profileUpload, (req, res) => void saveProfile(req as TenantRequest, res));

schoolSetupRouter.post("/academic-year", async (req: TenantRequest, res) => {
  const schoolId = req.schoolId;
  if (!schoolId) {
    return res.status(400).json({ error: "Missing tenant context" });
  }

  const { year, terms } = req.body as {
    year?: number;
    terms?: Array<{ name?: string; startDate?: string; endDate?: string }>;
  };

  if (!year || !Array.isArray(terms) || terms.length === 0) {
    return res.status(400).json({ error: "Year and terms are required" });
  }

  await pool.query("BEGIN");
  try {
    await pool.query(
      "UPDATE academic_years SET is_current = false WHERE school_id = $1",
      [schoolId],
    );

    const academicYearResult = await pool.query(
      `INSERT INTO academic_years (id, school_id, year, is_current)
       VALUES ($1, $2, $3, true)
       RETURNING id`,
      [crypto.randomUUID(), schoolId, year],
    );
    const academicYearId = academicYearResult.rows[0].id;

    await pool.query("DELETE FROM terms WHERE school_id = $1", [schoolId]);

    for (const term of terms) {
      await pool.query(
        `INSERT INTO terms (id, school_id, academic_year_id, name, start_date, end_date, is_current)
         VALUES ($1, $2, $3, $4, $5, $6, false)`,
        [
          crypto.randomUUID(),
          schoolId,
          academicYearId,
          term.name ?? "",
          term.startDate ?? null,
          term.endDate ?? null,
        ],
      );
    }

    await pool.query("COMMIT");
    return res.status(201).json({ data: { id: academicYearId } });
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
});

schoolSetupRouter.post("/grading-scale", async (req: TenantRequest, res) => {
  const schoolId = req.schoolId;
  if (!schoolId) {
    return res.status(400).json({ error: "Missing tenant context" });
  }

  const bands = req.body as Array<{
    label?: string;
    minScore?: number;
    maxScore?: number;
    description?: string;
  }>;
  if (!Array.isArray(bands) || bands.length === 0) {
    return res.status(400).json({ error: "At least one grading band is required" });
  }

  await pool.query("BEGIN");
  try {
    await pool.query("DELETE FROM grading_scales WHERE school_id = $1", [schoolId]);
    for (const band of bands) {
      await pool.query(
        `INSERT INTO grading_scales (id, school_id, label, min_score, max_score, description)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          crypto.randomUUID(),
          schoolId,
          band.label ?? "",
          band.minScore ?? 0,
          band.maxScore ?? 0,
          band.description ?? null,
        ],
      );
    }
    await pool.query("COMMIT");

    // TODO: Kweko — marks/report card integration after grading scale saved

    return res.status(201).json({ data: { ok: true } });
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
});

schoolSetupRouter.post("/complete", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  if (!schoolId) {
    return res.status(400).json({ error: "Missing tenant context" });
  }

  const [schoolResult, yearResult, gradingResult] = await Promise.all([
    pool.query("SELECT name, school_type FROM schools WHERE id = $1", [schoolId]),
    pool.query("SELECT COUNT(*)::int AS count FROM academic_years WHERE school_id = $1", [schoolId]),
    pool.query("SELECT COUNT(*)::int AS count FROM grading_scales WHERE school_id = $1", [schoolId]),
  ]);

  const school = schoolResult.rows[0];
  if (!school?.name || !school?.school_type) {
    return res.status(400).json({ error: "School profile is incomplete", code: "PROFILE_INCOMPLETE" });
  }

  if (Number(yearResult.rows[0]?.count ?? 0) === 0) {
    return res.status(400).json({ error: "Academic year is not configured", code: "ACADEMIC_YEAR_INCOMPLETE" });
  }

  if (Number(gradingResult.rows[0]?.count ?? 0) === 0) {
    return res.status(400).json({ error: "Grading scale is not configured", code: "GRADING_INCOMPLETE" });
  }

  await pool.query("BEGIN");
  try {
    const result = await pool.query(
      `UPDATE schools
       SET status = 'active', setup_completed_at = NOW()
       WHERE id = $1 AND status = 'setup'
       RETURNING *`,
      [schoolId],
    );

    if (!result.rowCount) {
      await pool.query("ROLLBACK");
      return res.status(400).json({ error: "School setup is already complete", code: "ALREADY_ACTIVE" });
    }

    await pool.query(
      `UPDATE users u
       SET setup_completed = true, updated_at = NOW()
       WHERE u.school_id = $1 AND ${USER_ADMIN_ROLE_SQL}`,
      [schoolId],
    );

    await pool.query("COMMIT");

    // TODO: Ssekyanzi — teacher/student user provisioning hooks here

    const tenantUser = req.tenantUser;
    if (tenantUser) {
      const userResult = await pool.query<{
        email: string;
        name: string;
        role: string;
        school_slug: string;
      }>(
        `SELECT
           u.email,
           ${USER_DISPLAY_NAME_SQL} AS name,
           u.role,
           s.slug AS school_slug
         FROM users u
         INNER JOIN schools s ON s.id = u.school_id
         WHERE u.id = $1
         LIMIT 1`,
        [tenantUser.sub],
      );

      const user = userResult.rows[0];
      if (user) {
        const normalizedRole = normalizeUserRole(user.role);
        const payload = {
          sub: tenantUser.sub,
          email: user.email,
          name: user.name,
          role: normalizedRole as "admin" | "head_teacher" | "teacher" | "learner",
          schoolId,
          schoolSlug: user.school_slug,
          mustChangePassword: false,
          setupCompleted: true,
        };

        res.cookie(TENANT_ACCESS_COOKIE, signTenantToken(payload, "15m"), cookieOptions(15 * 60 * 1000));
        res.cookie(TENANT_REFRESH_COOKIE, signTenantToken(payload, "7d"), cookieOptions(7 * 24 * 60 * 60 * 1000));
      }
    }

    return res.json({ data: result.rows[0] });
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
});
