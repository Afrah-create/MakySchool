import { Router } from "express";
import { pool } from "../../db/pool.js";
import type { TenantRequest } from "../../middleware/tenant.js";

export const subjectsRouter = Router();

subjectsRouter.get("/", async (req: TenantRequest, res) => {
  const schoolId = req.schoolId;
  if (!schoolId) {
    return res.status(400).json({ error: "Missing tenant context" });
  }

  const result = await pool.query("SELECT id, name, created_at FROM subjects WHERE school_id = $1 ORDER BY created_at DESC", [schoolId]);
  return res.json({ data: result.rows });
});

subjectsRouter.post("/", async (req: TenantRequest, res) => {
  const schoolId = req.schoolId;
  const { name } = req.body as { name?: string };
  if (!schoolId || !name) {
    return res.status(400).json({ error: "Subject name is required" });
  }

  const result = await pool.query(
    `INSERT INTO subjects (id, school_id, name)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [crypto.randomUUID(), schoolId, name.trim()],
  );

  return res.status(201).json({ data: result.rows[0] });
});

subjectsRouter.delete("/:id", async (req: TenantRequest, res) => {
  const schoolId = req.schoolId;
  if (!schoolId) {
    return res.status(400).json({ error: "Missing tenant context" });
  }

  await pool.query("DELETE FROM subjects WHERE id = $1 AND school_id = $2", [req.params.id, schoolId]);
  return res.json({ data: { ok: true } });
});