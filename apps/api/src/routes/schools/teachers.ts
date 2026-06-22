import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import type { Response } from "express";
import { Router } from "express";
import { can } from "@makyschool/shared/constants";
import { pool } from "../../db/pool.js";
import { USER_DISPLAY_NAME_SQL, USER_LEARNER_ROLE_SQL } from "../../db/userSql.js";
import type { AuthenticatedTenantRequest } from "../../middleware/tenantAuth.js";

export const teachersRouter = Router();

type AssignmentInput = {
  class_id: string;
  subject_id?: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9\s\-]{7,15}$/;
const BLOCKED_SELF_UPDATE_FIELDS = [
  "role",
  "email",
  "school_id",
  "assignments",
  "is_active",
] as const;

function sendError(
  res: Response,
  status: number,
  error: string,
  code: string,
  fields?: Record<string, string>,
) {
  return res.status(status).json({
    error,
    code,
    ...(fields ? { fields } : {}),
  });
}

function formatClassName(level: string, stream: string | null) {
  return stream ? `${level}${stream}` : level;
}

async function getCurrentTermId(schoolId: string): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM terms
     WHERE school_id = $1 AND is_current = true
     ORDER BY id ASC
     LIMIT 1`,
    [schoolId],
  );
  return result.rows[0]?.id ?? null;
}

async function validateTeacherFields(
  schoolId: string,
  data: {
    full_name?: string;
    email?: string;
    phone?: string | null;
    assignments?: AssignmentInput[];
  },
  options: { requireEmail?: boolean; requireName?: boolean } = {},
) {
  const fields: Record<string, string> = {};
  const { requireEmail = false, requireName = false } = options;

  if (requireName || data.full_name !== undefined) {
    const name = data.full_name?.trim() ?? "";
    if (!name) {
      fields.full_name = "Full name is required.";
    } else if (name.length < 2) {
      fields.full_name = "Full name must be at least 2 characters.";
    } else if (name.length > 100) {
      fields.full_name = "Full name must be under 100 characters.";
    }
  }

  if (requireEmail || data.email !== undefined) {
    const email = data.email?.trim() ?? "";
    if (!email) {
      fields.email = "Email address is required.";
    } else if (!EMAIL_RE.test(email)) {
      fields.email = "Enter a valid email address.";
    }
  }

  if (data.phone !== undefined && data.phone !== null && data.phone.trim()) {
    if (!PHONE_RE.test(data.phone.trim())) {
      fields.phone = "Enter a valid phone number.";
    }
  }

  if (data.assignments !== undefined) {
    for (let i = 0; i < data.assignments.length; i += 1) {
      const item = data.assignments[i];
      const classCheck = await pool.query(
        "SELECT 1 FROM school_classes WHERE id = $1 AND school_id = $2 LIMIT 1",
        [item.class_id, schoolId],
      );
      if (!classCheck.rowCount) {
        fields.assignments = `Class assignment ${i + 1} references a class that does not exist in your school.`;
        break;
      }

      if (item.subject_id) {
        const subjectCheck = await pool.query(
          `SELECT 1
           FROM school_subjects s
           JOIN school_class_subjects cs ON cs.subject_id = s.id AND cs.class_id = $1
           WHERE s.id = $2 AND s.school_id = $3
           LIMIT 1`,
          [item.class_id, item.subject_id, schoolId],
        );
        if (!subjectCheck.rowCount) {
          fields.assignments = `Subject in assignment ${i + 1} is not linked to the selected class.`;
          break;
        }
      }
    }
  }

  return fields;
}

async function insertAssignments(
  schoolId: string,
  teacherId: string,
  assignedBy: string,
  assignments: AssignmentInput[],
) {
  for (const item of assignments) {
    await pool.query(
      `INSERT INTO teacher_class_assignments
         (id, school_id, teacher_id, class_id, subject_id, assigned_by, assigned_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
       ON CONFLICT (school_id, teacher_id, class_id, subject_id) DO NOTHING`,
      [schoolId, teacherId, item.class_id, item.subject_id ?? null, assignedBy],
    );
  }
}

async function scaffoldTermSubmissions(
  schoolId: string,
  teacherId: string,
  assignments: AssignmentInput[],
) {
  const termId = await getCurrentTermId(schoolId);
  if (!termId) {
    return;
  }

  const classIds = [...new Set(assignments.map((a) => a.class_id))];
  for (const classId of classIds) {
    // TODO: Kweko — populate submission status when marks module is built
    await pool.query(
      `INSERT INTO teacher_term_submissions (school_id, teacher_id, class_id, term_id, status)
       VALUES ($1, $2, $3, $4, 'pending')
       ON CONFLICT (school_id, teacher_id, class_id, term_id) DO NOTHING`,
      [schoolId, teacherId, classId, termId],
    );
  }
}

async function fetchTeacherDetail(schoolId: string, teacherId: string) {
  const result = await pool.query(
    `SELECT
       u.id,
       ${USER_DISPLAY_NAME_SQL} AS full_name,
       u.email,
       u.phone,
       u.subject_specialization,
       COALESCE(u.is_active, true) AS is_active,
       u.created_at,
       u.last_login,
       u.last_login_at,
       u.profile_updated_at,
       u.created_by,
       COALESCE(creator.name, creator.full_name) AS created_by_name
     FROM users u
     LEFT JOIN users creator ON creator.id = u.created_by
     WHERE u.id = $1
       AND u.school_id = $2
       AND LOWER(u.role) = 'teacher'
     LIMIT 1`,
    [teacherId, schoolId],
  );

  const teacher = result.rows[0];
  if (!teacher) {
    return null;
  }

  const assignmentsResult = await pool.query(
    `SELECT
       tca.id AS assignment_id,
       sc.id AS class_id,
       sc.level,
       sc.stream,
       s.id AS subject_id,
       s.name AS subject_name
     FROM teacher_class_assignments tca
     JOIN school_classes sc ON sc.id = tca.class_id
     LEFT JOIN school_subjects s ON s.id = tca.subject_id
     WHERE tca.school_id = $1 AND tca.teacher_id = $2
     ORDER BY sc.level, sc.stream, s.name`,
    [schoolId, teacherId],
  );

  const assignments = assignmentsResult.rows.map((row) => ({
    assignment_id: row.assignment_id,
    class_id: row.class_id,
    class_name: formatClassName(row.level, row.stream),
    stream: row.stream,
    subject_id: row.subject_id,
    subject_name: row.subject_name,
  }));

  const termId = await getCurrentTermId(schoolId);

  const submissionResult = await pool.query(
    `SELECT
       sc.level,
       sc.stream,
       tts.status,
       tts.submitted_at
     FROM teacher_term_submissions tts
     JOIN school_classes sc ON sc.id = tts.class_id
     WHERE tts.school_id = $1
       AND tts.teacher_id = $2
       AND ($3::uuid IS NULL OR tts.term_id = $3)
     ORDER BY sc.level, sc.stream`,
    [schoolId, teacherId, termId],
  );

  const submission_status = submissionResult.rows.map((row) => ({
  // TODO: Kweko — marks submission status
    class_name: formatClassName(row.level, row.stream),
    status: row.status,
    submitted_at: row.submitted_at,
  }));

  const studentCountResult = await pool.query<{ count: string }>(
    `SELECT COUNT(DISTINCT learners.id)::int AS count
     FROM teacher_class_assignments tca
     LEFT JOIN users learners
       ON learners.school_class_id = tca.class_id
      AND learners.school_id = tca.school_id
      AND ${USER_LEARNER_ROLE_SQL.replaceAll("u.", "learners.")}
     WHERE tca.school_id = $1 AND tca.teacher_id = $2`,
    [schoolId, teacherId],
  );

  // TODO: Ssekyanzi — wire student count when class_members is built
  const total_students = Number(studentCountResult.rows[0]?.count ?? 0);

  return {
    id: teacher.id,
    full_name: teacher.full_name,
    email: teacher.email,
    phone: teacher.phone,
    subject_specialization: teacher.subject_specialization,
    role: "teacher" as const,
    is_active: teacher.is_active,
    created_at: teacher.created_at,
    last_login: teacher.last_login ?? teacher.last_login_at ?? null,
    profile_updated_at: teacher.profile_updated_at,
    created_by: teacher.created_by,
    created_by_name: teacher.created_by_name ?? null,
    assignments,
    submission_status,
    total_students,
  };
}

teachersRouter.get("/me", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  const actor = req.tenantUser;

  if (!schoolId || !actor) {
    return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  }

  if (actor.role !== "teacher") {
    return sendError(res, 403, "Only teachers can access this endpoint.", "FORBIDDEN");
  }

  const teacher = await fetchTeacherDetail(schoolId, actor.sub);
  if (!teacher) {
    return sendError(res, 404, "Teacher profile not found.", "NOT_FOUND");
  }

  return res.json({ data: teacher });
});

teachersRouter.get("/", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  if (!schoolId) {
    return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  }

  const search = (req.query.search as string | undefined)?.trim();
  const isActiveParam = req.query.is_active as string | undefined;
  const classId = req.query.class_id as string | undefined;
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const offset = (page - 1) * limit;

  const conditions = ["u.school_id = $1", "LOWER(u.role) = 'teacher'"];
  const params: unknown[] = [schoolId];
  let paramIndex = 2;

  if (isActiveParam === "true" || isActiveParam === "false") {
    conditions.push(`COALESCE(u.is_active, true) = $${paramIndex}`);
    params.push(isActiveParam === "true");
    paramIndex += 1;
  }

  if (classId) {
    conditions.push(`EXISTS (
      SELECT 1 FROM teacher_class_assignments tca_f
      WHERE tca_f.teacher_id = u.id AND tca_f.school_id = u.school_id AND tca_f.class_id = $${paramIndex}
    )`);
    params.push(classId);
    paramIndex += 1;
  }

  if (search) {
    conditions.push(
      `(${USER_DISPLAY_NAME_SQL} ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`,
    );
    params.push(`%${search}%`);
    paramIndex += 1;
  }

  const whereClause = conditions.join(" AND ");

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(DISTINCT u.id)::int AS count
     FROM users u
     WHERE ${whereClause}`,
    params,
  );

  const total = Number(countResult.rows[0]?.count ?? 0);

  const listParams = [...params, limit, offset];
  const result = await pool.query(
    `SELECT
       u.id,
       ${USER_DISPLAY_NAME_SQL} AS full_name,
       u.email,
       u.phone,
       u.subject_specialization,
       COALESCE(u.is_active, true) AS is_active,
       u.created_at,
       COALESCE(u.last_login, u.last_login_at) AS last_login,
       COALESCE(
         json_agg(
           DISTINCT jsonb_build_object(
             'assignment_id', tca.id,
             'class_id', sc.id,
             'class_name', sc.level || COALESCE(sc.stream, ''),
             'stream', sc.stream,
             'subject_id', s.id,
             'subject_name', s.name
           )
         ) FILTER (WHERE tca.id IS NOT NULL),
         '[]'
       ) AS assignments,
       COALESCE((
         SELECT COUNT(DISTINCT learners.id)::int
         FROM teacher_class_assignments tca2
         LEFT JOIN users learners
           ON learners.school_class_id = tca2.class_id
          AND learners.school_id = tca2.school_id
          AND ${USER_LEARNER_ROLE_SQL.replaceAll("u.", "learners.")}
         WHERE tca2.teacher_id = u.id AND tca2.school_id = u.school_id
       ), 0) AS total_students
     FROM users u
     LEFT JOIN teacher_class_assignments tca
       ON tca.teacher_id = u.id AND tca.school_id = u.school_id
     LEFT JOIN school_classes sc ON sc.id = tca.class_id
     LEFT JOIN school_subjects s ON s.id = tca.subject_id
     WHERE ${whereClause}
     GROUP BY u.id
     ORDER BY ${USER_DISPLAY_NAME_SQL} ASC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    listParams,
  );

  return res.json({
    data: {
      teachers: result.rows,
      total,
      page,
      limit,
    },
  });
});

teachersRouter.post("/", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  const actor = req.tenantUser;

  if (!schoolId || !actor) {
    return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  }

  if (!can(actor.role, "manageUsers")) {
    return sendError(res, 403, "You do not have permission to manage teachers.", "FORBIDDEN");
  }

  const {
    full_name,
    email,
    phone,
    subject_specialization,
    assignments = [],
  } = req.body as {
    full_name?: string;
    email?: string;
    phone?: string;
    subject_specialization?: string;
    assignments?: AssignmentInput[];
  };

  const fields = await validateTeacherFields(
    schoolId,
    { full_name, email, phone, assignments },
    { requireEmail: true, requireName: true },
  );

  if (Object.keys(fields).length > 0) {
    return sendError(
      res,
      422,
      "Please fix the highlighted fields and try again.",
      "VALIDATION_ERROR",
      fields,
    );
  }

  const normalizedEmail = email!.toLowerCase().trim();

  const existing = await pool.query(
    "SELECT id FROM users WHERE school_id = $1 AND LOWER(email) = LOWER($2) LIMIT 1",
    [schoolId, normalizedEmail],
  );

  if (existing.rowCount) {
    return sendError(
      res,
      422,
      "A teacher with this email already exists in your school.",
      "VALIDATION_ERROR",
      { email: "A teacher with this email already exists in your school." },
    );
  }

  const tempPassword = randomBytes(10).toString("hex");
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  await pool.query("BEGIN");

  try {
    const insertResult = await pool.query<{ id: string }>(
      `INSERT INTO users (
         id, full_name, name, email, phone, subject_specialization,
         password_hash, role, school_id, account_status,
         is_active, is_temp_password, setup_completed, created_by, created_at
       ) VALUES (
         gen_random_uuid(), $1, $1, $2, $3, $4,
         $5, 'teacher', $6, 'ACTIVE',
         true, true, true, $7, NOW()
       )
       RETURNING id`,
      [
        full_name!.trim(),
        normalizedEmail,
        phone?.trim() || null,
        subject_specialization?.trim() || null,
        passwordHash,
        schoolId,
        actor.sub,
      ],
    );

    const teacherId = insertResult.rows[0].id;

    if (assignments.length > 0) {
      await insertAssignments(schoolId, teacherId, actor.sub, assignments);
      await scaffoldTermSubmissions(schoolId, teacherId, assignments);
    }

    await pool.query("COMMIT");

    const teacher = await fetchTeacherDetail(schoolId, teacherId);

    return res.status(201).json({
      data: {
        teacher,
        temp_password: tempPassword,
      },
    });
  } catch {
    await pool.query("ROLLBACK");
    return sendError(
      res,
      500,
      "Something went wrong. Please try again.",
      "SERVER_ERROR",
    );
  }
});

teachersRouter.get("/:id", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  const teacherId = String(req.params.id);

  if (!schoolId) {
    return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  }

  const teacher = await fetchTeacherDetail(schoolId, teacherId);
  if (!teacher) {
    return sendError(res, 404, "Teacher not found in your school.", "NOT_FOUND");
  }

  return res.json({ data: teacher });
});

teachersRouter.patch("/:id/profile", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  const actor = req.tenantUser;
  const teacherId = String(req.params.id);

  if (!schoolId || !actor) {
    return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  }

  if (actor.sub !== teacherId) {
    return sendError(res, 403, "You can only update your own profile.", "FORBIDDEN");
  }

  for (const field of BLOCKED_SELF_UPDATE_FIELDS) {
    if (field in (req.body as Record<string, unknown>)) {
      return sendError(
        res,
        403,
        "You cannot change your role or class assignments. Contact your school administrator.",
        "FORBIDDEN",
      );
    }
  }

  const { full_name, phone } = req.body as { full_name?: string; phone?: string };

  const fields = await validateTeacherFields(schoolId, { full_name, phone });
  if (Object.keys(fields).length > 0) {
    return sendError(
      res,
      422,
      "Please fix the highlighted fields and try again.",
      "VALIDATION_ERROR",
      fields,
    );
  }

  const result = await pool.query(
    `UPDATE users
     SET full_name = COALESCE($1, full_name),
         name = COALESCE($1, name),
         phone = COALESCE($2, phone),
         profile_updated_at = NOW(),
         updated_at = NOW()
     WHERE id = $3 AND school_id = $4 AND LOWER(role) = 'teacher'
     RETURNING id`,
    [full_name?.trim() || null, phone?.trim() || null, teacherId, schoolId],
  );

  if (!result.rowCount) {
    return sendError(res, 404, "Teacher not found in your school.", "NOT_FOUND");
  }

  const teacher = await fetchTeacherDetail(schoolId, teacherId);
  return res.json({ data: teacher });
});

teachersRouter.patch("/:id", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  const actor = req.tenantUser;
  const teacherId = String(req.params.id);

  if (!schoolId || !actor) {
    return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  }

  if (!can(actor.role, "manageUsers")) {
    return sendError(res, 403, "You do not have permission to manage teachers.", "FORBIDDEN");
  }

  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM users
     WHERE id = $1 AND school_id = $2 AND LOWER(role) = 'teacher'
     LIMIT 1`,
    [teacherId, schoolId],
  );

  if (!existing.rowCount) {
    return sendError(res, 404, "Teacher not found in your school.", "NOT_FOUND");
  }

  const {
    full_name,
    phone,
    subject_specialization,
    assignments,
  } = req.body as {
    full_name?: string;
    phone?: string | null;
    subject_specialization?: string | null;
    assignments?: AssignmentInput[];
  };

  const fields = await validateTeacherFields(schoolId, {
    full_name,
    phone: phone ?? undefined,
    assignments,
  });

  if (Object.keys(fields).length > 0) {
    return sendError(
      res,
      422,
      "Please fix the highlighted fields and try again.",
      "VALIDATION_ERROR",
      fields,
    );
  }

  await pool.query("BEGIN");

  try {
    await pool.query(
      `UPDATE users
       SET full_name = COALESCE($1, full_name),
           name = COALESCE($1, name),
           phone = COALESCE($2, phone),
           subject_specialization = COALESCE($3, subject_specialization),
           profile_updated_at = NOW(),
           updated_at = NOW()
       WHERE id = $4 AND school_id = $5`,
      [
        full_name?.trim() || null,
        phone === undefined ? null : phone,
        subject_specialization === undefined ? null : subject_specialization,
        teacherId,
        schoolId,
      ],
    );

    if (assignments !== undefined) {
      await pool.query(
        "DELETE FROM teacher_class_assignments WHERE teacher_id = $1 AND school_id = $2",
        [teacherId, schoolId],
      );
      if (assignments.length > 0) {
        await insertAssignments(schoolId, teacherId, actor.sub, assignments);
        await scaffoldTermSubmissions(schoolId, teacherId, assignments);
      }
    }

    await pool.query("COMMIT");
  } catch {
    await pool.query("ROLLBACK");
    return sendError(res, 500, "Something went wrong. Please try again.", "SERVER_ERROR");
  }

  const teacher = await fetchTeacherDetail(schoolId, teacherId);
  return res.json({ data: teacher });
});

teachersRouter.patch("/:id/deactivate", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  const actor = req.tenantUser;
  const teacherId = String(req.params.id);

  if (!schoolId || !actor) {
    return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  }

  if (!can(actor.role, "manageUsers")) {
    return sendError(res, 403, "You do not have permission to manage teachers.", "FORBIDDEN");
  }

  const existing = await pool.query<{ full_name: string; is_active: boolean }>(
    `SELECT ${USER_DISPLAY_NAME_SQL} AS full_name, COALESCE(is_active, true) AS is_active
     FROM users
     WHERE id = $1 AND school_id = $2 AND LOWER(role) = 'teacher'
     LIMIT 1`,
    [teacherId, schoolId],
  );

  const teacher = existing.rows[0];
  if (!teacher) {
    return sendError(res, 404, "Teacher not found in your school.", "NOT_FOUND");
  }

  if (!teacher.is_active) {
    return sendError(
      res,
      409,
      "This teacher account is already deactivated.",
      "ALREADY_DEACTIVATED",
    );
  }

  const { reason } = req.body as { reason?: string };

  await pool.query(
    `UPDATE users
     SET is_active = false,
         deactivated_at = NOW(),
         deactivated_reason = $1,
         account_status = 'SUSPENDED',
         updated_at = NOW()
     WHERE id = $2 AND school_id = $3`,
    [reason?.trim() || null, teacherId, schoolId],
  );

  return res.json({
    data: {
      message: `${teacher.full_name}'s account has been deactivated. They will not be able to log in.`,
      teacher: { id: teacherId, full_name: teacher.full_name, is_active: false },
    },
  });
});

teachersRouter.patch("/:id/reactivate", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  const actor = req.tenantUser;
  const teacherId = String(req.params.id);

  if (!schoolId || !actor) {
    return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  }

  if (!can(actor.role, "manageUsers")) {
    return sendError(res, 403, "You do not have permission to manage teachers.", "FORBIDDEN");
  }

  const existing = await pool.query<{ full_name: string; is_active: boolean }>(
    `SELECT ${USER_DISPLAY_NAME_SQL} AS full_name, COALESCE(is_active, true) AS is_active
     FROM users
     WHERE id = $1 AND school_id = $2 AND LOWER(role) = 'teacher'
     LIMIT 1`,
    [teacherId, schoolId],
  );

  const teacher = existing.rows[0];
  if (!teacher) {
    return sendError(res, 404, "Teacher not found in your school.", "NOT_FOUND");
  }

  if (teacher.is_active) {
    return sendError(res, 409, "This teacher account is already active.", "ALREADY_ACTIVE");
  }

  await pool.query(
    `UPDATE users
     SET is_active = true,
         deactivated_at = NULL,
         deactivated_reason = NULL,
         account_status = 'ACTIVE',
         updated_at = NOW()
     WHERE id = $1 AND school_id = $2`,
    [teacherId, schoolId],
  );

  return res.json({
    data: {
      message: `${teacher.full_name}'s account has been reactivated. They can now log in.`,
      teacher: { id: teacherId, full_name: teacher.full_name, is_active: true },
    },
  });
});

teachersRouter.post("/:id/reset-password", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  const actor = req.tenantUser;
  const teacherId = String(req.params.id);

  if (!schoolId || !actor) {
    return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  }

  if (!can(actor.role, "manageUsers")) {
    return sendError(res, 403, "You do not have permission to manage teachers.", "FORBIDDEN");
  }

  const tempPassword = randomBytes(10).toString("hex");
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const result = await pool.query(
    `UPDATE users
     SET password_hash = $1,
         is_temp_password = true,
         updated_at = NOW()
     WHERE id = $2 AND school_id = $3 AND LOWER(role) = 'teacher'
     RETURNING id`,
    [passwordHash, teacherId, schoolId],
  );

  if (!result.rowCount) {
    return sendError(res, 404, "Teacher not found in your school.", "NOT_FOUND");
  }

  return res.json({ data: { temp_password: tempPassword } });
});
