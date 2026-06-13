import { Router } from "express";
import { pool } from "../../db/pool.js";

export const schoolPreviewRouter = Router();

schoolPreviewRouter.get("/:slug", async (req, res) => {
  const slug = String(req.params.slug).trim().toLowerCase();
  if (!slug) {
    return res.status(400).json({ error: "School slug is required" });
  }

  const result = await pool.query<{
    name: string | null;
    logo_url: string | null;
    slug: string;
    school_type: string | null;
  }>(
    `SELECT name, logo_url, slug, school_type
     FROM schools
     WHERE slug = $1
     LIMIT 1`,
    [slug],
  );

  if (!result.rowCount) {
    return res.status(404).json({ error: "School not found" });
  }

  return res.json({ data: result.rows[0] });
});
