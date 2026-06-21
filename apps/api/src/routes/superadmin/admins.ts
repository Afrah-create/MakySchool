import bcrypt from "bcrypt";
import { Router } from "express";
import { pool } from "../../db/pool.js";
import { requireSuperAdmin, type SuperAdminRequest } from "../../middleware/superAdminAuth.js";
import { validatePassword } from "../../utils/password.js";

export const superAdminAdminsRouter = Router();

superAdminAdminsRouter.use(requireSuperAdmin);

superAdminAdminsRouter.get("/", async (_req, res) => {
  const result = await pool.query<{
    id: string;
    email: string;
    name: string;
    created_at: string;
  }>(
    `SELECT id, email, name, created_at
     FROM super_admins
     ORDER BY created_at ASC`,
  );

  return res.json({ data: result.rows });
});

superAdminAdminsRouter.post("/", async (req: SuperAdminRequest, res) => {
  const { name, email, password } = req.body as {
    name?: string;
    email?: string;
    password?: string;
  };

  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: "Name, email, and password are required" });
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }

  const normalizedEmail = email.toLowerCase().trim();

  const existing = await pool.query(
    "SELECT 1 FROM super_admins WHERE LOWER(email) = LOWER($1) LIMIT 1",
    [normalizedEmail],
  );
  if (existing.rowCount) {
    return res.status(409).json({ error: "A platform admin with this email already exists" });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const id = crypto.randomUUID();

  await pool.query(
    `INSERT INTO super_admins (id, email, password_hash, name)
     VALUES ($1, $2, $3, $4)`,
    [id, normalizedEmail, passwordHash, name.trim()],
  );

  return res.status(201).json({
    data: {
      id,
      email: normalizedEmail,
      name: name.trim(),
    },
  });
});
