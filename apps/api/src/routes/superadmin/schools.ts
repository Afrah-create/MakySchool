import bcrypt from "bcrypt";
import { Router } from "express";
import { requireSuperAdmin } from "../../middleware/superAdminAuth.js";
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
      COALESCE(u.email, '') AS admin_email
    FROM schools s
    LEFT JOIN LATERAL (
      SELECT email FROM users WHERE school_id = s.id AND role = 'admin' ORDER BY created_at ASC LIMIT 1
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
       COUNT(*) FILTER (WHERE status = 'active')::int AS active_schools,
       COUNT(*) FILTER (WHERE status = 'setup')::int AS setup_schools,
       COALESCE(SUM(sp.amount), 0)::int AS revenue_current_term
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

  const schoolId = crypto.randomUUID();
  const tempPassword = crypto.randomUUID().slice(0, 12);
  const slug = await generateUniqueSlug(schoolName);
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  await pool.query("BEGIN");
  try {
    await pool.query(
      `INSERT INTO schools (id, slug, name, status, subscription_status) VALUES ($1, $2, $3, 'setup', 'unpaid')`,
      [schoolId, slug, schoolName.trim()],
    );

    await pool.query(
      `INSERT INTO users (id, school_id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, $5, 'admin')`,
      [crypto.randomUUID(), schoolId, adminEmail.toLowerCase().trim(), passwordHash, adminName.trim()],
    );

    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }

  return res.status(201).json({
    data: {
      school: { id: schoolId, slug, name: schoolName, status: "setup" },
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
      (SELECT COUNT(*)::int FROM classes WHERE school_id = $1) AS classes,
      (SELECT COUNT(*)::int FROM users WHERE school_id = $1 AND role = 'teacher') AS teachers,
      (SELECT COUNT(*)::int FROM users WHERE school_id = $1 AND role = 'learner') AS students`,
    [id],
  );
  const [yearResult, gradingResult] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS count FROM academic_years WHERE school_id = $1", [id]),
    pool.query("SELECT COUNT(*)::int AS count FROM grading_scales WHERE school_id = $1", [id]),
  ]);

  return res.json({
    data: {
      school,
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

  const result = await pool.query("UPDATE schools SET status = $1 WHERE id = $2 RETURNING id, status", [status, id]);
  if (!result.rowCount) {
    return res.status(404).json({ error: "School not found" });
  }

  return res.json({ data: result.rows[0] });
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