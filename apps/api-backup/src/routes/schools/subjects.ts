import { Router } from "express";
import { pool } from "../../db/pool.js";
import type { TenantRequest } from "../../middleware/tenant.js";
import { getAllowedLevelsSqlParam, getSchoolType } from "../../utils/classes.js";

export const subjectsRouter = Router();

subjectsRouter.get("/", async (req: TenantRequest, res) => {
  const schoolId = req.schoolId;
  if (!schoolId) {
    return res.status(400).json({ error: "Missing tenant context" });
  }

  const result = await pool.query(
    `SELECT
       s.id,
       s.name,
       s.created_at,
       COALESCE((
         SELECT COUNT(*)::int
         FROM school_class_subjects cs
         WHERE cs.subject_id = s.id
       ), 0) AS class_count,
       COALESCE((
         SELECT json_agg(cs.class_id)
         FROM school_class_subjects cs
         WHERE cs.subject_id = s.id
       ), '[]'::json) AS class_ids
     FROM school_subjects s
     WHERE s.school_id = $1
     ORDER BY s.name ASC`,
    [schoolId],
  );

  return res.json({ data: result.rows });
});

subjectsRouter.post("/", async (req: TenantRequest, res) => {
  const schoolId = req.schoolId;
  if (!schoolId) {
    return res.status(400).json({ error: "Missing tenant context" });
  }

  const { name } = req.body as { name?: string };
  if (!name?.trim()) {
    return res.status(400).json({ error: "Subject name is required" });
  }

  const duplicate = await pool.query(
    "SELECT id FROM school_subjects WHERE school_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1",
    [schoolId, name.trim()],
  );

  if (duplicate.rowCount) {
    return res.status(409).json({
      error: "A subject with this name already exists.",
      code: "DUPLICATE_SUBJECT",
    });
  }

  const result = await pool.query(
    `INSERT INTO school_subjects (id, school_id, name)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [crypto.randomUUID(), schoolId, name.trim()],
  );

  return res.status(201).json({ data: result.rows[0] });
});

subjectsRouter.patch("/:id", async (req: TenantRequest, res) => {
  const schoolId = req.schoolId;
  const id = String(req.params.id);
  if (!schoolId) {
    return res.status(400).json({ error: "Missing tenant context" });
  }

  const { name } = req.body as { name?: string };
  if (!name?.trim()) {
    return res.status(400).json({ error: "Subject name is required" });
  }

  const duplicate = await pool.query(
    `SELECT id FROM school_subjects
     WHERE school_id = $1 AND LOWER(name) = LOWER($2) AND id <> $3
     LIMIT 1`,
    [schoolId, name.trim(), id],
  );

  if (duplicate.rowCount) {
    return res.status(409).json({
      error: "A subject with this name already exists.",
      code: "DUPLICATE_SUBJECT",
    });
  }

  const result = await pool.query(
    `UPDATE school_subjects
     SET name = $1,
         updated_at = NOW()
     WHERE id = $2 AND school_id = $3
     RETURNING *`,
    [name.trim(), id, schoolId],
  );

  if (!result.rowCount) {
    return res.status(404).json({ error: "Subject not found" });
  }

  return res.json({ data: result.rows[0] });
});

subjectsRouter.put("/:id/classes", async (req: TenantRequest, res) => {
  const schoolId = req.schoolId;
  const subjectId = String(req.params.id);
  const { classIds } = req.body as { classIds?: string[] };

  if (!schoolId) {
    return res.status(400).json({ error: "Missing tenant context" });
  }

  if (!Array.isArray(classIds)) {
    return res.status(400).json({ error: "classIds must be an array" });
  }

  const subject = await pool.query(
    "SELECT id FROM school_subjects WHERE id = $1 AND school_id = $2",
    [subjectId, schoolId],
  );

  if (!subject.rowCount) {
    return res.status(404).json({ error: "Subject not found" });
  }

  const uniqueClassIds = [...new Set(classIds)];

  if (uniqueClassIds.length > 0) {
    const schoolType = await getSchoolType(schoolId);
    const allowedLevels = getAllowedLevelsSqlParam(schoolType);

    const validClasses = await pool.query(
      `SELECT id FROM school_classes
       WHERE school_id = $1
         AND id = ANY($2::uuid[])
         AND level = ANY($3::text[])`,
      [schoolId, uniqueClassIds, allowedLevels],
    );

    if (validClasses.rowCount !== uniqueClassIds.length) {
      return res.status(400).json({
        error: "One or more classes are invalid for your school type.",
        code: "INVALID_CLASS",
      });
    }
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      "DELETE FROM school_class_subjects WHERE school_id = $1 AND subject_id = $2",
      [schoolId, subjectId],
    );

    for (const classId of uniqueClassIds) {
      await client.query(
        `INSERT INTO school_class_subjects (id, school_id, class_id, subject_id)
         VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), schoolId, classId, subjectId],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return res.json({ data: { ok: true, classIds: uniqueClassIds } });
});

subjectsRouter.delete("/:id", async (req: TenantRequest, res) => {
  const schoolId = req.schoolId;
  const id = String(req.params.id);
  if (!schoolId) {
    return res.status(400).json({ error: "Missing tenant context" });
  }

  const linkCount = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM school_class_subjects
     WHERE school_id = $1 AND subject_id = $2`,
    [schoolId, id],
  );

  const count = Number(linkCount.rows[0]?.count ?? 0);
  if (count > 0) {
    return res.status(409).json({
      error: `Cannot delete this subject. It is linked to ${count} class${count === 1 ? "" : "es"}. Unlink it first.`,
      code: "SUBJECT_HAS_LINKS",
      classCount: count,
    });
  }

  const result = await pool.query(
    "DELETE FROM school_subjects WHERE id = $1 AND school_id = $2 RETURNING id",
    [id, schoolId],
  );

  if (!result.rowCount) {
    return res.status(404).json({ error: "Subject not found" });
  }

  return res.json({ data: { ok: true } });
});
