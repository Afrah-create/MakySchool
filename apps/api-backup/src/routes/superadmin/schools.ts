import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import { Router } from "express";
import { requireSuperAdmin } from "../../middleware/superAdminAuth.js";
import {
  USER_ADMIN_ROLE_SQL,
  USER_DISPLAY_NAME_SQL,
  USER_LEARNER_ROLE_SQL,
  USER_TEACHER_ROLE_SQL,
} from "../../db/userSql.js";
import { pool } from "../../db/pool.js";
import { slugifySchoolName } from "../../utils/slug.js";

export const superAdminSchoolsRouter = Router();

superAdminSchoolsRouter.use(requireSuperAdmin);

async function generateUniqueSlug(name: string) {
  const baseSlug = slugifySchoolName(name);
  let suffix = 1;
  let candidate = baseSlug;

  while (true) {
    const existing = await pool.query("SELECT 1 FROM schools WHERE slug = $1 LIMIT 1", [candidate]);
    if (!existing.rowCount) {
      return candidate;
    }
    suffix += 1;
    candidate = `${baseSlug}-${suffix}`;
  }
}

superAdminSchoolsRouter.get("/", async (req, res) => {
  const search = String(req.query.search ?? "").trim();
  const status = String(req.query.status ?? "").trim();
  const page = Math.max(Number(req.query.page ?? 1) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit ?? 20) || 20, 1), 100);
  const offset = (page - 1) * limit;

  const where: string[] = [];
  const params: Array<string | number> = [];

  if (search) {
    params.push(`%${search}%`);
    where.push(`(s.name ILIKE $${params.length} OR s.slug ILIKE $${params.length})`);
  }

  if (status) {
    params.push(status);
    where.push(`s.status = $${params.length}`);
  }

  params.push(limit, offset);

  const query = `
    SELECT
      s.id,
      s.name,
      s.slug,
      s.status,
      s.subscription_status,
      s.school_type,
      s.created_at,
      COALESCE(u.email, '') AS admin_email,
      (SELECT COUNT(*)::int FROM users u2 WHERE u2.school_id = s.id) AS user_count
    FROM schools s
    LEFT JOIN LATERAL (
      SELECT email FROM users u WHERE u.school_id = s.id AND ${USER_ADMIN_ROLE_SQL} ORDER BY u.created_at ASC LIMIT 1
    ) u ON true
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY s.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const result = await pool.query(query, params);
  const countResult = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM schools s ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`, params.slice(0, -2));
  const statsResult = await pool.query(
    `SELECT
       COUNT(*)::int AS total_schools,
       COUNT(*) FILTER (WHERE s.status = 'active')::int AS active_schools,
       COUNT(*) FILTER (WHERE s.status = 'setup')::int AS setup_schools,
       COALESCE(SUM(sp.amount) FILTER (WHERE sp.status = 'completed'), 0)::int AS revenue_current_term
     FROM schools s
     LEFT JOIN subscription_payments sp ON sp.school_id = s.id
     ${status ? `WHERE s.status = $1` : ""}`,
    status ? [status] : [],
  );

  return res.json({
    data: {
      items: result.rows,
      page,
      limit,
      total: Number(countResult.rows[0]?.count ?? 0),
      stats: statsResult.rows[0],
    },
  });
});

superAdminSchoolsRouter.post("/", async (req, res) => {
  const { schoolName, adminName, adminEmail } = req.body as {
    schoolName?: string;
    adminName?: string;
    adminEmail?: string;
  };

  if (!schoolName || !adminName || !adminEmail) {
    return res.status(400).json({ error: "School name, admin name, and admin email are required" });
  }

  const normalizedAdminEmail = adminEmail.toLowerCase().trim();

  const existingEmail = await pool.query(
    `SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) AND school_id IS NOT NULL LIMIT 1`,
    [normalizedAdminEmail],
  );
  if (existingEmail.rowCount) {
    return res.status(409).json({ error: "Admin email is already in use for a school account" });
  }

  const schoolId = crypto.randomUUID();
  const tempPassword = randomBytes(10).toString("hex");
  const slug = await generateUniqueSlug(schoolName);
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  await pool.query("BEGIN");
  try {
    await pool.query(
      `INSERT INTO schools (id, slug, name, status, subscription_status) VALUES ($1, $2, $3, 'setup', 'unpaid')`,
      [schoolId, slug, schoolName.trim()],
    );

    await pool.query(
      `INSERT INTO users (
         id, school_id, email, password_hash, full_name, name, role, account_status,
         is_temp_password, setup_completed
       ) VALUES ($1, $2, $3, $4, $5, $5, 'ADMIN', 'ACTIVE', true, false)`,
      [crypto.randomUUID(), schoolId, normalizedAdminEmail, passwordHash, adminName.trim()],
    );

    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }

  return res.status(201).json({
    data: {
      school: { id: schoolId, slug, name: schoolName, status: "setup" },
      admin: { email: normalizedAdminEmail },
      tempPassword,
    },
  });
});

superAdminSchoolsRouter.get("/:id", async (req, res) => {
  const { id } = req.params;

  const schoolResult = await pool.query("SELECT * FROM schools WHERE id = $1 LIMIT 1", [id]);
  const school = schoolResult.rows[0];

  if (!school) {
    return res.status(404).json({ error: "School not found" });
  }

  const subscriptionResult = await pool.query(
    "SELECT id, amount, term, year, schoolpay_ref, paid_at FROM subscription_payments WHERE school_id = $1 ORDER BY paid_at DESC",
    [id],
  );
  const countsResult = await pool.query(
    `SELECT
      (SELECT COUNT(*)::int FROM school_classes WHERE school_id = $1) AS classes,
      (SELECT COUNT(*)::int FROM users u WHERE u.school_id = $1 AND ${USER_TEACHER_ROLE_SQL}) AS teachers,
      (SELECT COUNT(*)::int FROM users u WHERE u.school_id = $1 AND ${USER_LEARNER_ROLE_SQL}) AS students`,
    [id],
  );
  const [yearResult, gradingResult, adminResult] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS count FROM academic_years WHERE school_id = $1", [id]),
    pool.query("SELECT COUNT(*)::int AS count FROM grading_scales WHERE school_id = $1", [id]),
    pool.query<{ id: string; email: string; name: string }>(
      `SELECT u.id, u.email, ${USER_DISPLAY_NAME_SQL} AS name
       FROM users u
       WHERE u.school_id = $1 AND ${USER_ADMIN_ROLE_SQL}
       ORDER BY u.created_at ASC
       LIMIT 1`,
      [id],
    ),
  ]);

  return res.json({
    data: {
      school,
      admin: adminResult.rows[0] ?? null,
      subscriptionHistory: subscriptionResult.rows,
      counts: countsResult.rows[0] ?? { classes: 0, teachers: 0, students: 0 },
      setupStatus: {
        profileComplete: Boolean(school.name && school.school_type),
        academicYearComplete: Number(yearResult.rows[0]?.count ?? 0) > 0,
        gradingScaleComplete: Number(gradingResult.rows[0]?.count ?? 0) > 0,
      },
    },
  });
});

superAdminSchoolsRouter.patch("/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body as { status?: "active" | "suspended" };

  if (!status || !["active", "suspended"].includes(status)) {
    return res.status(400).json({ error: "Valid status is required" });
  }

  if (status === "active") {
    const current = await pool.query<{ status: string }>(
      "SELECT status FROM schools WHERE id = $1 LIMIT 1",
      [id],
    );
    if (current.rows[0]?.status === "setup") {
      return res.status(400).json({
        error: "School must complete setup before activation",
        code: "SETUP_INCOMPLETE",
      });
    }
  }

  const result = await pool.query("UPDATE schools SET status = $1 WHERE id = $2 RETURNING id, status", [status, id]);
  if (!result.rowCount) {
    return res.status(404).json({ error: "School not found" });
  }

  return res.json({ data: result.rows[0] });
});

superAdminSchoolsRouter.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const {
    name,
    slug,
    schoolType,
    email,
    phone,
    address,
    subscriptionStatus,
    subscriptionTerm,
    subscriptionYear,
    schoolpayCode,
    adminName,
    adminEmail,
  } = req.body as {
    name?: string;
    slug?: string;
    schoolType?: string;
    email?: string;
    phone?: string;
    address?: string;
    subscriptionStatus?: "unpaid" | "active" | "expired";
    subscriptionTerm?: string;
    subscriptionYear?: number;
    schoolpayCode?: string | null;
    adminName?: string;
    adminEmail?: string;
  };

  const schoolResult = await pool.query("SELECT id FROM schools WHERE id = $1 LIMIT 1", [id]);
  if (!schoolResult.rowCount) {
    return res.status(404).json({ error: "School not found" });
  }

  if (slug?.trim()) {
    const normalizedSlug = slugifySchoolName(slug);
    const slugConflict = await pool.query(
      "SELECT 1 FROM schools WHERE slug = $1 AND id <> $2 LIMIT 1",
      [normalizedSlug, id],
    );
    if (slugConflict.rowCount) {
      return res.status(409).json({ error: "Another school already uses this slug" });
    }
  }

  if (adminEmail?.trim()) {
    const normalizedAdminEmail = adminEmail.toLowerCase().trim();
    const emailConflict = await pool.query(
      `SELECT 1 FROM users
       WHERE LOWER(email) = LOWER($1) AND school_id IS NOT NULL AND school_id <> $2
       LIMIT 1`,
      [normalizedAdminEmail, id],
    );
    if (emailConflict.rowCount) {
      return res.status(409).json({ error: "Admin email is already in use for another school" });
    }
  }

  if (
    subscriptionStatus &&
    !["unpaid", "active", "expired"].includes(subscriptionStatus)
  ) {
    return res.status(400).json({ error: "Invalid subscription status" });
  }

  await pool.query("BEGIN");
  try {
    const result = await pool.query(
      `UPDATE schools
       SET name = COALESCE($1, name),
           slug = COALESCE($2, slug),
           school_type = COALESCE($3, school_type),
           email = COALESCE($4, email),
           phone = COALESCE($5, phone),
           address = COALESCE($6, address),
           subscription_status = COALESCE($7, subscription_status),
           subscription_term = COALESCE($8, subscription_term),
           subscription_year = COALESCE($9, subscription_year),
           schoolpay_code = CASE WHEN $10::boolean THEN $11 ELSE schoolpay_code END
       WHERE id = $12
       RETURNING *`,
      [
        name?.trim() || null,
        slug?.trim() ? slugifySchoolName(slug) : null,
        schoolType?.trim() || null,
        email?.trim() || null,
        phone?.trim() || null,
        address?.trim() || null,
        subscriptionStatus ?? null,
        subscriptionTerm?.trim() || null,
        subscriptionYear ?? null,
        schoolpayCode !== undefined,
        schoolpayCode?.trim() || null,
        id,
      ],
    );

    if (adminName?.trim() || adminEmail?.trim()) {
      await pool.query(
        `UPDATE users u
         SET name = COALESCE($1, u.name),
             full_name = COALESCE($1, u.full_name),
             email = COALESCE($2, u.email)
         WHERE u.school_id = $3 AND ${USER_ADMIN_ROLE_SQL}`,
        [adminName?.trim() || null, adminEmail?.trim().toLowerCase() || null, id],
      );
    }

    await pool.query("COMMIT");

    const adminResult = await pool.query<{ id: string; email: string; name: string }>(
      `SELECT u.id, u.email, ${USER_DISPLAY_NAME_SQL} AS name
       FROM users u
       WHERE u.school_id = $1 AND ${USER_ADMIN_ROLE_SQL}
       ORDER BY u.created_at ASC
       LIMIT 1`,
      [id],
    );

    return res.json({
      data: {
        school: result.rows[0],
        admin: adminResult.rows[0] ?? null,
      },
    });
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
});

superAdminSchoolsRouter.delete("/:id", async (req, res) => {
  const { id } = req.params;

  const result = await pool.query("DELETE FROM schools WHERE id = $1 RETURNING id, name", [id]);
  if (!result.rowCount) {
    return res.status(404).json({ error: "School not found" });
  }

  return res.json({
    data: {
      id: result.rows[0].id,
      name: result.rows[0].name,
    },
  });
});

superAdminSchoolsRouter.post("/:id/subscription", async (req, res) => {
  const { id } = req.params;
  const { amount, term, year, schoolpayRef } = req.body as {
    amount?: number;
    term?: string;
    year?: number;
    schoolpayRef?: string;
  };

  if (!amount || !term || !year) {
    return res.status(400).json({ error: "Amount, term, and year are required" });
  }

  await pool.query("BEGIN");
  try {
    await pool.query(
      `INSERT INTO subscription_payments (id, school_id, amount, term, year, schoolpay_ref)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [crypto.randomUUID(), id, amount, term, year, schoolpayRef ?? null],
    );
    await pool.query(
      `UPDATE schools
       SET subscription_status = 'active', subscription_term = $1, subscription_year = $2
       WHERE id = $3`,
      [term, year, id],
    );
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }

  return res.status(201).json({ data: { ok: true } });
});