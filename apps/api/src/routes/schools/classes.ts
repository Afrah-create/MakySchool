import { Router } from "express";
import { pool } from "../../db/pool.js";
import type { TenantRequest } from "../../middleware/tenant.js";

export const classesRouter = Router();

classesRouter.get("/", async (req: TenantRequest, res) => {
  const schoolId = req.schoolId;
  if (!schoolId) {
    return res.status(400).json({ error: "Missing tenant context" });
  }

  const result = await pool.query(
    `SELECT
       c.id,
       c.level,
       c.stream,
       c.capacity,
       COALESCE((SELECT COUNT(*)::int FROM users u WHERE u.school_id = c.school_id AND u.role = 'learner' AND u.class_id = c.id), 0) AS student_count,
       COALESCE((SELECT json_agg(json_build_object('id', s.id, 'name', s.name)) FROM class_subjects cs JOIN subjects s ON s.id = cs.subject_id WHERE cs.class_id = c.id), '[]'::json) AS subjects
     FROM classes c
     WHERE c.school_id = $1
     ORDER BY c.created_at DESC`,
    [schoolId],
  );

  return res.json({ data: result.rows });
});

classesRouter.post("/", async (req: TenantRequest, res) => {
  const schoolId = req.schoolId;
  if (!schoolId) {
    return res.status(400).json({ error: "Missing tenant context" });
  }

  const { level, stream, capacity } = req.body as { level?: string; stream?: string; capacity?: number };
  if (!level) {
    return res.status(400).json({ error: "Level is required" });
  }

  const result = await pool.query(
    `INSERT INTO classes (id, school_id, level, stream, capacity)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [crypto.randomUUID(), schoolId, level, stream ?? null, capacity ?? null],
  );

  return res.status(201).json({ data: result.rows[0] });
});

classesRouter.delete("/:id", async (req: TenantRequest, res) => {
  const schoolId = req.schoolId;
  const { id } = req.params;
  if (!schoolId) {
    return res.status(400).json({ error: "Missing tenant context" });
  }

  const studentCount = await pool.query(
    "SELECT COUNT(*)::int AS count FROM users WHERE school_id = $1 AND role = 'learner' AND class_id = $2",
    [schoolId, id],
  );

  if (Number(studentCount.rows[0]?.count ?? 0) > 0) {
    return res.status(409).json({ error: "Cannot delete a class that still has students" });
  }

  await pool.query("DELETE FROM classes WHERE id = $1 AND school_id = $2", [id, schoolId]);
  return res.json({ data: { ok: true } });
});

classesRouter.post("/:id/subjects", async (req: TenantRequest, res) => {
  const schoolId = req.schoolId;
  const { id } = req.params;
  const { subjectId } = req.body as { subjectId?: string };

  if (!schoolId || !subjectId) {
    return res.status(400).json({ error: "Missing tenant context or subject id" });
  }

  await pool.query(
    `INSERT INTO class_subjects (id, school_id, class_id, subject_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (class_id, subject_id) DO NOTHING`,
    [crypto.randomUUID(), schoolId, id, subjectId],
  );

  return res.status(201).json({ data: { ok: true } });
});

classesRouter.delete("/:id/subjects/:subjectId", async (req: TenantRequest, res) => {
  const schoolId = req.schoolId;
  const { id, subjectId } = req.params;
  if (!schoolId) {
    return res.status(400).json({ error: "Missing tenant context" });
  }

  await pool.query("DELETE FROM class_subjects WHERE school_id = $1 AND class_id = $2 AND subject_id = $3", [schoolId, id, subjectId]);
  return res.json({ data: { ok: true } });
});