import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { Router } from "express";
import { can } from "@makyschool/shared/constants";
import type { MakySchoolRole } from "@makyschool/shared/types";
import { pool } from "../../db/pool.js";
import { USER_DISPLAY_NAME_SQL, normalizeUserRole } from "../../db/userSql.js";
import {
  scaffoldTermSubmissions,
  syncTeacherAssignments,
  type AssignmentInput,
} from "../../lib/teacherAssignments.js";
import type { AuthenticatedTenantRequest } from "../../middleware/tenantAuth.js";
import { validatePassword } from "../../utils/password.js";

export const usersRouter = Router();

type ClassAssignmentInput = AssignmentInput;

const CREATABLE_ROLES: MakySchoolRole[] = ["head_teacher", "teacher", "bursar", "learner"];
const ASSIGNABLE_ROLES: MakySchoolRole[] = ["head_teacher", "teacher"];

function stripSensitive<T extends Record<string, unknown>>(row: T) {
  const {
    password_hash: _ph,
    password_reset_token: _prt,
    ...rest
  } = row as T & { password_hash?: string; password_reset_token?: string };
  return rest;
}

async function fetchAssignmentsForUsers(schoolId: string, userIds: string[]) {
  if (userIds.length === 0) {
    return new Map<string, unknown[]>();
  }

  const result = await pool.query(
    `SELECT
       tca.teacher_id,
       tca.class_id,
       tca.subject_id,
       c.level,
       c.stream,
       s.name AS subject_name
     FROM teacher_class_assignments tca
     JOIN school_classes c ON c.id = tca.class_id
     LEFT JOIN school_subjects s ON s.id = tca.subject_id
     WHERE tca.school_id = $1
       AND tca.teacher_id = ANY($2::uuid[])
     ORDER BY c.level, c.stream, s.name`,
    [schoolId, userIds],
  );

  const map = new Map<string, unknown[]>();
  for (const row of result.rows) {
    const list = map.get(row.teacher_id) ?? [];
    list.push({
      class_id: row.class_id,
      subject_id: row.subject_id,
      class_name: row.level,
      stream: row.stream,
      subject_name: row.subject_name,
    });
    map.set(row.teacher_id, list);
  }
  return map;
}

async function replaceTeacherAssignments(
  schoolId: string,
  teacherId: string,
  assignedBy: string,
  assignments: ClassAssignmentInput[],
) {
  const result = await syncTeacherAssignments(schoolId, teacherId, assignedBy, assignments, {
    acknowledge_warnings: true,
  });
  if (!result.ok) {
    const message =
      result.code === "ASSIGNMENT_LOCKED"
        ? result.fields?.assignments ?? result.error
        : result.error;
    throw new Error(message);
  }
  if (result.preview.to_add.length > 0) {
    await scaffoldTermSubmissions(schoolId, teacherId, result.preview.to_add);
  }
}

function parseAssignments(body: {
  class_ids?: string[];
  subject_ids?: string[];
  assignments?: ClassAssignmentInput[];
}): ClassAssignmentInput[] {
  if (body.assignments?.length) {
    return body.assignments;
  }

  const classIds = body.class_ids ?? [];
  const subjectIds = body.subject_ids ?? [];

  if (subjectIds.length === 0) {
    return classIds.map((class_id) => ({ class_id }));
  }

  const rows: ClassAssignmentInput[] = [];
  for (const class_id of classIds) {
    for (const subject_id of subjectIds) {
      rows.push({ class_id, subject_id });
    }
  }
  return rows;
}

usersRouter.get("/", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  if (!schoolId) {
    return res.status(400).json({ error: "Missing tenant context" });
  }

  const roleFilter = req.query.role as string | undefined;
  const isActiveFilter = req.query.is_active as string | undefined;
  const search = (req.query.search as string | undefined)?.trim();

  const conditions = ["u.school_id = $1"];
  const params: unknown[] = [schoolId];
  let paramIndex = 2;

  if (roleFilter) {
    conditions.push(`LOWER(u.role) = LOWER($${paramIndex})`);
    params.push(roleFilter);
    paramIndex += 1;
  }

  if (isActiveFilter === "true" || isActiveFilter === "false") {
    conditions.push(`COALESCE(u.is_active, true) = $${paramIndex}`);
    params.push(isActiveFilter === "true");
    paramIndex += 1;
  }

  if (search) {
    conditions.push(
      `(LOWER(${USER_DISPLAY_NAME_SQL}) LIKE LOWER($${paramIndex}) OR LOWER(u.email) LIKE LOWER($${paramIndex}))`,
    );
    params.push(`%${search}%`);
    paramIndex += 1;
  }

  const result = await pool.query(
    `SELECT
       u.id,
       u.email,
       ${USER_DISPLAY_NAME_SQL} AS full_name,
       u.role,
       u.phone,
       u.subject_specialization,
       COALESCE(u.is_active, true) AS is_active,
       u.deactivated_at,
       u.deactivated_reason,
       u.created_at
     FROM users u
     WHERE ${conditions.join(" AND ")}
     ORDER BY ${USER_DISPLAY_NAME_SQL} ASC`,
    params,
  );

  const teacherIds = result.rows
    .filter((row) => ASSIGNABLE_ROLES.includes(normalizeUserRole(row.role) as MakySchoolRole))
    .map((row) => row.id);

  const assignmentMap = await fetchAssignmentsForUsers(schoolId, teacherIds);

  const data = result.rows.map((row) => ({
    ...stripSensitive(row),
    role: normalizeUserRole(row.role),
    assigned_classes: assignmentMap.get(row.id) ?? [],
  }));

  return res.json({ data });
});

usersRouter.post("/", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  const actor = req.tenantUser;

  if (!schoolId || !actor) {
    return res.status(400).json({ error: "Missing tenant context" });
  }

  if (!can(actor.role, "manageUsers")) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const {
    full_name,
    email,
    role,
    phone,
    subject_specialization,
    class_ids,
    subject_ids,
    assignments,
  } = req.body as {
    full_name?: string;
    email?: string;
    role?: string;
    phone?: string;
    subject_specialization?: string;
    class_ids?: string[];
    subject_ids?: string[];
    assignments?: ClassAssignmentInput[];
  };

  if (!full_name?.trim() || !email?.trim() || !role) {
    return res.status(400).json({ error: "Full name, email, and role are required" });
  }

  const normalizedRole = role.toLowerCase() as MakySchoolRole;

  if (normalizedRole === "admin") {
    return res.status(403).json({ error: "Cannot create admin accounts" });
  }

  if (!CREATABLE_ROLES.includes(normalizedRole)) {
    return res.status(400).json({ error: "Invalid role" });
  }

  const normalizedEmail = email.toLowerCase().trim();

  const existing = await pool.query(
    "SELECT 1 FROM users WHERE school_id = $1 AND LOWER(email) = LOWER($2) LIMIT 1",
    [schoolId, normalizedEmail],
  );

  if (existing.rowCount) {
    return res.status(409).json({ error: "Email is already in use at this school" });
  }

  const tempPassword = randomBytes(10).toString("hex");
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  const userId = crypto.randomUUID();

  await pool.query("BEGIN");

  try {
    await pool.query(
      `INSERT INTO users (
         id, school_id, email, password_hash, full_name, name, role,
         phone, subject_specialization, is_temp_password, is_active,
         account_status, created_by
       ) VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, true, true, 'ACTIVE', $9)`,
      [
        userId,
        schoolId,
        normalizedEmail,
        passwordHash,
        full_name.trim(),
        normalizedRole,
        phone?.trim() || null,
        subject_specialization?.trim() || null,
        actor.sub,
      ],
    );

    const parsedAssignments = parseAssignments({ class_ids, subject_ids, assignments });

    if (ASSIGNABLE_ROLES.includes(normalizedRole) && parsedAssignments.length > 0) {
      await replaceTeacherAssignments(schoolId, userId, actor.sub, parsedAssignments);
    }

    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }

  return res.status(201).json({
    data: {
      user: {
        id: userId,
        full_name: full_name.trim(),
        email: normalizedEmail,
        role: normalizedRole,
      },
      temp_password: tempPassword,
    },
  });
});

usersRouter.get("/:id", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  const id = String(req.params.id);

  if (!schoolId) {
    return res.status(400).json({ error: "Missing tenant context" });
  }

  const result = await pool.query(
    `SELECT
       u.id,
       u.email,
       ${USER_DISPLAY_NAME_SQL} AS full_name,
       u.role,
       u.phone,
       u.subject_specialization,
       COALESCE(u.is_active, true) AS is_active,
       u.deactivated_at,
       u.deactivated_reason,
       u.created_at
     FROM users u
     WHERE u.id = $1 AND u.school_id = $2
     LIMIT 1`,
    [id, schoolId],
  );

  const user = result.rows[0];
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const assignmentMap = await fetchAssignmentsForUsers(schoolId, [user.id]);

  return res.json({
    data: {
      ...stripSensitive(user),
      role: normalizeUserRole(user.role),
      assigned_classes: assignmentMap.get(user.id) ?? [],
    },
  });
});

usersRouter.patch("/:id", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  const actor = req.tenantUser;
  const id = String(req.params.id);

  if (!schoolId || !actor) {
    return res.status(400).json({ error: "Missing tenant context" });
  }

  if (!can(actor.role, "manageUsers")) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const {
    full_name,
    phone,
    subject_specialization,
    role,
    class_ids,
    subject_ids,
    assignments,
  } = req.body as {
    full_name?: string;
    phone?: string | null;
    subject_specialization?: string | null;
    role?: string;
    class_ids?: string[];
    subject_ids?: string[];
    assignments?: ClassAssignmentInput[];
  };

  const existing = await pool.query<{ role: string }>(
    "SELECT role FROM users WHERE id = $1 AND school_id = $2 LIMIT 1",
    [id, schoolId],
  );

  if (!existing.rowCount) {
    return res.status(404).json({ error: "User not found" });
  }

  const currentRole = normalizeUserRole(existing.rows[0].role) as MakySchoolRole;
  const nextRole = role ? (role.toLowerCase() as MakySchoolRole) : currentRole;

  if (nextRole === "admin") {
    return res.status(403).json({ error: "Cannot assign admin role" });
  }

  await pool.query(
    `UPDATE users
     SET full_name = COALESCE($1, full_name),
         name = COALESCE($1, name),
         phone = COALESCE($2, phone),
         subject_specialization = COALESCE($3, subject_specialization),
         role = COALESCE($4, role),
         updated_at = NOW()
     WHERE id = $5 AND school_id = $6`,
    [
      full_name?.trim() || null,
      phone === undefined ? null : phone,
      subject_specialization === undefined ? null : subject_specialization,
      role ? nextRole : null,
      id,
      schoolId,
    ],
  );

  const effectiveRole = role ? nextRole : currentRole;
  const parsedAssignments = parseAssignments({ class_ids, subject_ids, assignments });

  if (
    ASSIGNABLE_ROLES.includes(effectiveRole) &&
    (assignments !== undefined || class_ids !== undefined)
  ) {
    await replaceTeacherAssignments(schoolId, id, actor.sub, parsedAssignments);
  }

  const updated = await pool.query(
    `SELECT id, email, ${USER_DISPLAY_NAME_SQL} AS full_name, role, phone, subject_specialization
     FROM users u WHERE id = $1`,
    [id],
  );

  return res.json({
    data: {
      ...updated.rows[0],
      role: normalizeUserRole(updated.rows[0].role),
    },
  });
});

usersRouter.patch("/:id/deactivate", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  const actor = req.tenantUser;
  const id = String(req.params.id);

  if (!schoolId || !actor) {
    return res.status(400).json({ error: "Missing tenant context" });
  }

  if (!can(actor.role, "manageUsers")) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { reason } = req.body as { reason?: string };

  const result = await pool.query(
    `UPDATE users
     SET is_active = false,
         account_status = 'INACTIVE',
         deactivated_at = NOW(),
         deactivated_reason = $1,
         updated_at = NOW()
     WHERE id = $2 AND school_id = $3
     RETURNING id`,
    [reason?.trim() || null, id, schoolId],
  );

  if (!result.rowCount) {
    return res.status(404).json({ error: "User not found" });
  }

  return res.json({ data: { ok: true } });
});

usersRouter.patch("/:id/reactivate", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  const actor = req.tenantUser;
  const id = String(req.params.id);

  if (!schoolId || !actor) {
    return res.status(400).json({ error: "Missing tenant context" });
  }

  if (!can(actor.role, "manageUsers")) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const result = await pool.query(
    `UPDATE users
     SET is_active = true,
         account_status = 'ACTIVE',
         deactivated_at = NULL,
         deactivated_reason = NULL,
         updated_at = NOW()
     WHERE id = $1 AND school_id = $2
     RETURNING id`,
    [id, schoolId],
  );

  if (!result.rowCount) {
    return res.status(404).json({ error: "User not found" });
  }

  return res.json({ data: { ok: true } });
});

usersRouter.post("/:id/reset-password", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  const actor = req.tenantUser;
  const id = String(req.params.id);

  if (!schoolId || !actor) {
    return res.status(400).json({ error: "Missing tenant context" });
  }

  if (!can(actor.role, "manageUsers")) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const tempPassword = randomBytes(10).toString("hex");
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const result = await pool.query(
    `UPDATE users
     SET password_hash = $1,
         is_temp_password = true,
         updated_at = NOW()
     WHERE id = $2 AND school_id = $3
     RETURNING id`,
    [passwordHash, id, schoolId],
  );

  if (!result.rowCount) {
    return res.status(404).json({ error: "User not found" });
  }

  return res.json({ data: { temp_password: tempPassword } });
});
