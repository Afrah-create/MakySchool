import type { NextFunction, Response } from "express";
import { pool } from "../db/pool.js";
import { normalizeUserRole } from "../db/userSql.js";
import type { AuthenticatedTenantRequest } from "./tenantAuth.js";

export interface TeacherScopedRequest extends AuthenticatedTenantRequest {
  /** null means all classes in the school are allowed (admin / head teacher). */
  allowedClassIds?: string[] | null;
}

export async function teacherScope(
  req: TeacherScopedRequest,
  res: Response,
  next: NextFunction,
) {
  const schoolId = req.schoolId;
  const role = req.tenantUser?.role;

  if (!schoolId || !role) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const normalizedRole = normalizeUserRole(role);

  if (normalizedRole === "admin" || normalizedRole === "head_teacher") {
    req.allowedClassIds = null;
    return next();
  }

  if (normalizedRole !== "teacher") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const result = await pool.query<{ class_id: string }>(
    `SELECT DISTINCT class_id
     FROM teacher_class_assignments
     WHERE school_id = $1 AND teacher_id = $2`,
    [schoolId, req.tenantUser!.sub],
  );

  req.allowedClassIds = result.rows.map((row) => row.class_id);
  next();
}

export function assertClassAccess(req: TeacherScopedRequest, classId: string) {
  if (req.allowedClassIds === null) {
    return true;
  }
  return req.allowedClassIds?.includes(classId) ?? false;
}
