import { TENANT_HEADERS } from "@makyschool/shared/constants";
import { pool } from "../db/pool.js";
import type { NextFunction, Request, Response } from "express";
import { LRUCache } from "lru-cache";

export interface TenantRequest extends Request {
  schoolSlug?: string;
  schoolId?: string;
}

const schoolCache = new LRUCache<string, string>({
  max: 1000,
  ttl: 1000 * 60 * 5,
});

export function invalidateSchoolCache(slug: string) {
  schoolCache.delete(slug);
}

function isPublicRoute(path: string) {
  return (
    path.startsWith("/api/health") ||
    path.startsWith("/api/v1/health") ||
    path.startsWith("/api/auth") ||
    path.startsWith("/api/superadmin") ||
    path.startsWith("/api/webhooks")
  );
}

/** Resolves tenant from the school slug header and caches slug → id for 5 minutes. */
export function tenantMiddleware(
  req: TenantRequest,
  res: Response,
  next: NextFunction,
) {
  if (isPublicRoute(req.path)) {
    return next();
  }

  const schoolSlug = req.header(TENANT_HEADERS.SCHOOL_SLUG);

  if (!schoolSlug) {
    return res.status(400).json({
      error: "Missing tenant context",
      code: "TENANT_CONTEXT_REQUIRED",
    });
  }

  const cachedSchoolId = schoolCache.get(schoolSlug);
  if (cachedSchoolId) {
    req.schoolSlug = schoolSlug;
    req.schoolId = cachedSchoolId;
    return next();
  }

  pool
    .query<{ id: string }>("SELECT id FROM schools WHERE slug = $1 LIMIT 1", [
      schoolSlug,
    ])
    .then((result: { rows: Array<{ id: string }> }) => {
      const school = result.rows[0];

      if (!school) {
        res.status(404).json({ error: "School not found" });
        return;
      }

      schoolCache.set(schoolSlug, school.id);
      req.schoolSlug = schoolSlug;
      req.schoolId = school.id;
      next();
    })
    .catch(() => {
      res.status(500).json({ error: "Failed to resolve school tenant" });
    });
}
