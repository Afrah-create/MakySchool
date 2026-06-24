import { randomUUID } from "node:crypto";
import type { Response } from "express";
import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { can } from "@makyschool/shared/constants";
import { pool } from "../../db/pool.js";
import { USER_DISPLAY_NAME_SQL } from "../../db/userSql.js";
import type { AuthenticatedTenantRequest } from "../../middleware/tenantAuth.js";
import { generateLearnerId } from "../../lib/learnerIdGenerator.js";
import {
  ALLOWED_STUDENT_PHOTO_TYPES,
  saveStudentPhoto,
} from "../../lib/studentPhoto.js";

export const studentsRouter = Router();

const PHONE_RE = /^\+?[0-9\s\-]{7,15}$/;
const GENDERS = new Set(["male", "female", "other"]);
const RELATIONSHIPS = new Set(["parent", "guardian", "sibling", "other"]);
const CSV_REQUIRED_HEADERS = ["name", "class", "parent_name"] as const;

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_STUDENT_PHOTO_TYPES.has(file.mimetype)) {
      cb(new Error("Only JPEG, PNG, and WebP images are allowed."));
      return;
    }
    cb(null, true);
  },
});

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    if (!name.endsWith(".csv") && file.mimetype !== "text/csv") {
      cb(new Error("Only CSV files are allowed."));
      return;
    }
    cb(null, true);
  },
});

function sendError(
  res: Response,
  status: number,
  error: string,
  code: string,
  extra?: Record<string, unknown>,
) {
  return res.status(status).json({ error, code, ...extra });
}

function formatClassName(level: string, stream: string | null) {
  return stream ? `${level}${stream}` : level;
}

function ageFromDob(dob: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

function normalizeGender(value: string | undefined | null): string | null {
  if (!value?.trim()) return null;
  const raw = value.trim().toLowerCase();
  if (raw === "m" || raw === "male") return "male";
  if (raw === "f" || raw === "female") return "female";
  if (raw === "other") return "other";
  return null;
}

function normalizeRelationship(value: string | undefined | null): string {
  const raw = value?.trim().toLowerCase() ?? "parent";
  return RELATIONSHIPS.has(raw) ? raw : "parent";
}

async function loadClassMap(schoolId: string) {
  const result = await pool.query<{
    id: string;
    level: string;
    stream: string | null;
  }>(
    "SELECT id, level, stream FROM school_classes WHERE school_id = $1",
    [schoolId],
  );

  const byId = new Map<string, { id: string; level: string; stream: string | null; name: string }>();
  const byName = new Map<string, string>();

  for (const row of result.rows) {
    const name = formatClassName(row.level, row.stream);
    byId.set(row.id, { ...row, name });
    byName.set(name.toLowerCase(), row.id);
    byName.set(row.level.toLowerCase(), row.id);
  }

  return { byId, byName };
}

type StudentFormInput = {
  full_name?: string;
  date_of_birth?: string | null;
  gender?: string | null;
  class_id?: string;
  guardian_name?: string;
  guardian_phone?: string | null;
  guardian_email?: string | null;
  guardian_relationship?: string | null;
};

async function validateStudentFields(
  schoolId: string,
  data: StudentFormInput,
  options: { requireClass?: boolean; requireGuardian?: boolean; requireName?: boolean } = {},
) {
  const fields: Record<string, string> = {};
  const { requireClass = false, requireGuardian = false, requireName = false } = options;

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

  if (data.date_of_birth !== undefined && data.date_of_birth) {
    const dob = new Date(data.date_of_birth);
    if (Number.isNaN(dob.getTime())) {
      fields.date_of_birth = "Enter a valid date of birth.";
    } else if (dob > new Date()) {
      fields.date_of_birth = "Date of birth cannot be in the future.";
    } else {
      const age = ageFromDob(dob);
      if (age < 2) {
        fields.date_of_birth = "Student must be at least 2 years old.";
      } else if (age > 25) {
        fields.date_of_birth = "Student cannot be older than 25 years.";
      }
    }
  }

  if (data.gender !== undefined && data.gender !== null && data.gender !== "") {
    if (!GENDERS.has(data.gender)) {
      fields.gender = "Gender must be male, female, or other.";
    }
  }

  if (requireClass || data.class_id !== undefined) {
    if (!data.class_id) {
      fields.class_id = "Please select a class.";
    } else {
      const classCheck = await pool.query(
        "SELECT 1 FROM school_classes WHERE id = $1 AND school_id = $2 LIMIT 1",
        [data.class_id, schoolId],
      );
      if (!classCheck.rowCount) {
        fields.class_id = "The selected class does not exist in your school.";
      }
    }
  }

  if (requireGuardian || data.guardian_name !== undefined) {
    const guardianName = data.guardian_name?.trim() ?? "";
    if (!guardianName) {
      fields.guardian_name = "Guardian name is required.";
    } else if (guardianName.length < 2) {
      fields.guardian_name = "Guardian name must be at least 2 characters.";
    } else if (guardianName.length > 100) {
      fields.guardian_name = "Guardian name must be under 100 characters.";
    }
  }

  if (data.guardian_phone !== undefined && data.guardian_phone !== null && data.guardian_phone.trim()) {
    if (!PHONE_RE.test(data.guardian_phone.trim())) {
      fields.guardian_phone = "Enter a valid phone number.";
    }
  }

  if (
    data.guardian_relationship !== undefined &&
    data.guardian_relationship !== null &&
    data.guardian_relationship !== "" &&
    !RELATIONSHIPS.has(data.guardian_relationship)
  ) {
    fields.guardian_relationship = "Relationship must be parent, guardian, sibling, or other.";
  }

  return fields;
}

async function fetchStudentDetail(schoolId: string, studentId: string) {
  const studentResult = await pool.query(
    `SELECT
       s.*,
       sc.level,
       sc.stream,
       sc.id AS class_id,
       ${USER_DISPLAY_NAME_SQL.replaceAll("u.", "creator.")} AS created_by_name
     FROM students s
     LEFT JOIN school_classes sc ON sc.id = s.current_class_id
     LEFT JOIN users creator ON creator.id = s.created_by
     WHERE s.id = $1 AND s.school_id = $2
     LIMIT 1`,
    [studentId, schoolId],
  );

  const student = studentResult.rows[0];
  if (!student) return null;

  const guardianResult = await pool.query(
    `SELECT id, full_name, phone, email, relationship, is_primary
     FROM student_guardians
     WHERE student_id = $1 AND school_id = $2 AND is_primary = true
     LIMIT 1`,
    [studentId, schoolId],
  );

  const historyResult = await pool.query(
    `SELECT
       h.id,
       h.class_id,
       h.enrolled_at,
       h.left_at,
       h.reason,
       sc.level,
       sc.stream
     FROM student_class_history h
     JOIN school_classes sc ON sc.id = h.class_id
     WHERE h.student_id = $1 AND h.school_id = $2
     ORDER BY h.enrolled_at DESC`,
    [studentId, schoolId],
  );

  const class_name = student.level
    ? formatClassName(student.level, student.stream)
    : null;

  return {
    id: student.id,
    learner_id: student.learner_id,
    full_name: student.full_name,
    date_of_birth: student.date_of_birth,
    gender: student.gender,
    photo_url: student.photo_url,
    status: student.status,
    current_class_id: student.current_class_id,
    class_id: student.class_id,
    class_name,
    withdrawal_reason: student.withdrawal_reason,
    withdrawn_at: student.withdrawn_at,
    created_at: student.created_at,
    updated_at: student.updated_at,
    created_by: student.created_by,
    created_by_name: student.created_by_name ?? null,
    guardian: guardianResult.rows[0] ?? null,
    class_history: historyResult.rows.map((row) => ({
      id: row.id,
      class_id: row.class_id,
      class_name: formatClassName(row.level, row.stream),
      enrolled_at: row.enrolled_at,
      left_at: row.left_at,
      reason: row.reason,
    })),
    fee_history: [],
    // TODO: Awongo — fee payments
    results: [],
    // TODO: Kweko — academic results per term
  };
}

function mapListRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    learner_id: row.learner_id,
    full_name: row.full_name,
    date_of_birth: row.date_of_birth,
    gender: row.gender,
    photo_url: row.photo_url,
    status: row.status,
    created_at: row.created_at,
    class_id: row.class_id,
    class_name: row.class_name,
    guardian_name: row.guardian_name,
    guardian_phone: row.guardian_phone,
  };
}

studentsRouter.get("/import/template", async (_req: AuthenticatedTenantRequest, res) => {
  const csv = [
    "name,dob,gender,class,parent_name,parent_phone,parent_email",
    "John Doe,2015-03-12,male,P3A,James Doe,+256701234567,james@email.com",
    "Jane Smith,2014-07-20,female,P3A,Grace Smith,+256702345678,",
  ].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="student_import_template.csv"');
  return res.send(csv);
});

studentsRouter.post(
  "/import",
  csvUpload.single("file"),
  async (req: AuthenticatedTenantRequest, res) => {
    const schoolId = req.schoolId;
    const actor = req.tenantUser;

    if (!schoolId || !actor) {
      return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
    }

    if (!can(actor.role, "manageUsers")) {
      return sendError(res, 403, "You do not have permission to import students.", "FORBIDDEN");
    }

    if (!req.file) {
      return sendError(res, 422, "Please upload a CSV file.", "VALIDATION_ERROR", {
        fields: { file: "A CSV file is required." },
      });
    }

    let records: Record<string, string>[];
    try {
      records = parse(req.file.buffer, {
        columns: (headers: string[]) =>
          headers.map((header) => header.trim().toLowerCase()),
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      }) as Record<string, string>[];
    } catch {
      return sendError(res, 422, "Could not parse the CSV file.", "VALIDATION_ERROR");
    }

    const headers = Object.keys(records[0] ?? {});
    const missingHeaders = CSV_REQUIRED_HEADERS.filter((header) => !headers.includes(header));
    if (missingHeaders.length > 0) {
      return sendError(
        res,
        422,
        `CSV is missing required columns: ${missingHeaders.join(", ")}`,
        "VALIDATION_ERROR",
      );
    }

    const { byName } = await loadClassMap(schoolId);
    const rowErrors: Array<{ row: number; field: string; message: string }> = [];

    type ValidRow = {
      full_name: string;
      date_of_birth: string | null;
      gender: string | null;
      class_id: string;
      guardian_name: string;
      guardian_phone: string | null;
      guardian_email: string | null;
      guardian_relationship: string;
    };

    const validRows: ValidRow[] = [];

    records.forEach((record, index) => {
      const row = index + 2;
      const name = record.name?.trim() ?? "";
      const classLabel = record.class?.trim() ?? "";
      const parentName = record.parent_name?.trim() ?? "";
      const dobRaw = record.dob?.trim() ?? "";
      const genderRaw = record.gender?.trim() ?? "";
      const parentPhone = record.parent_phone?.trim() ?? "";
      const parentEmail = record.parent_email?.trim() ?? "";
      const relationshipRaw = record.guardian_relationship?.trim() ?? "";

      if (!name) {
        rowErrors.push({ row, field: "name", message: `Row ${row} is missing a student name.` });
      } else if (name.length < 2 || name.length > 100) {
        rowErrors.push({ row, field: "name", message: `Row ${row} has an invalid name.` });
      }

      if (!classLabel) {
        rowErrors.push({ row, field: "class", message: `Row ${row} is missing a class.` });
      } else {
        const classId = byName.get(classLabel.toLowerCase());
        if (!classId) {
          rowErrors.push({
            row,
            field: "class",
            message: `Row ${row}: class "${classLabel}" was not found in your school.`,
          });
        }
      }

      if (!parentName) {
        rowErrors.push({ row, field: "parent_name", message: `Row ${row} is missing a parent name.` });
      } else if (parentName.length < 2 || parentName.length > 100) {
        rowErrors.push({ row, field: "parent_name", message: `Row ${row} has an invalid parent name.` });
      }

      let dateOfBirth: string | null = null;
      if (dobRaw) {
        const dob = new Date(dobRaw);
        if (Number.isNaN(dob.getTime())) {
          rowErrors.push({ row, field: "dob", message: `Row ${row} has an invalid date of birth.` });
        } else {
          dateOfBirth = dob.toISOString().slice(0, 10);
        }
      }

      const gender = normalizeGender(genderRaw);
      if (genderRaw && !gender) {
        rowErrors.push({ row, field: "gender", message: `Row ${row} has an invalid gender.` });
      }

      if (parentPhone && !PHONE_RE.test(parentPhone)) {
        rowErrors.push({ row, field: "parent_phone", message: `Row ${row} has an invalid phone number.` });
      }

      if (rowErrors.some((error) => error.row === row)) {
        return;
      }

      const classId = byName.get(classLabel.toLowerCase())!;
      validRows.push({
        full_name: name,
        date_of_birth: dateOfBirth,
        gender,
        class_id: classId,
        guardian_name: parentName,
        guardian_phone: parentPhone || null,
        guardian_email: parentEmail || null,
        guardian_relationship: normalizeRelationship(relationshipRaw),
      });
    });

    if (rowErrors.length > 0) {
      return res.status(422).json({
        error: "Validation failed. Fix the errors below and re-upload.",
        code: "IMPORT_VALIDATION_FAILED",
        row_errors: rowErrors,
        summary: `${rowErrors.length} of ${records.length} rows have errors. No students were imported.`,
      });
    }

    if (validRows.length === 0) {
      return sendError(res, 422, "The CSV file contains no student rows.", "VALIDATION_ERROR");
    }

    const client = await pool.connect();
    const importId = randomUUID();

    try {
      await client.query("BEGIN");

      await client.query(
        `INSERT INTO student_import_logs (id, school_id, imported_by, filename, total_rows, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')`,
        [importId, schoolId, actor.sub, req.file.originalname, validRows.length],
      );

      for (const row of validRows) {
        const studentId = randomUUID();
        const learnerId = await generateLearnerId(schoolId, client);

        await client.query(
          `INSERT INTO students (
             id, school_id, learner_id, full_name, date_of_birth, gender,
             current_class_id, status, created_by, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, NOW(), NOW())`,
          [
            studentId,
            schoolId,
            learnerId,
            row.full_name,
            row.date_of_birth,
            row.gender,
            row.class_id,
            actor.sub,
          ],
        );

        await client.query(
          `INSERT INTO student_guardians (
             id, school_id, student_id, full_name, phone, email, relationship, is_primary
           ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true)`,
          [
            schoolId,
            studentId,
            row.guardian_name,
            row.guardian_phone,
            row.guardian_email,
            row.guardian_relationship,
          ],
        );

        await client.query(
          `INSERT INTO student_class_history (
             id, school_id, student_id, class_id, enrolled_at, reason, moved_by
           ) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), 'initial_enrollment', $4)`,
          [schoolId, studentId, row.class_id, actor.sub],
        );
      }

      await client.query(
        `UPDATE student_import_logs
         SET imported = $1, failed = 0, status = 'complete', errors = '[]'::jsonb
         WHERE id = $2`,
        [validRows.length, importId],
      );

      await client.query("COMMIT");

      return res.status(201).json({
        data: {
          message: `${validRows.length} students imported successfully.`,
          imported: validRows.length,
          import_id: importId,
        },
      });
    } catch {
      await client.query("ROLLBACK");
      return sendError(res, 500, "Something went wrong. Please try again.", "SERVER_ERROR");
    } finally {
      client.release();
    }
  },
);

studentsRouter.post("/promote-class", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  const actor = req.tenantUser;

  if (!schoolId || !actor) {
    return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  }

  if (!can(actor.role, "manageUsers")) {
    return sendError(res, 403, "You do not have permission to promote students.", "FORBIDDEN");
  }

  const { from_class_id, to_class_id, reason = "promotion" } = req.body as {
    from_class_id?: string;
    to_class_id?: string;
    reason?: string;
  };

  if (!from_class_id || !to_class_id) {
    return sendError(res, 422, "Both from and to classes are required.", "VALIDATION_ERROR", {
      fields: {
        ...(from_class_id ? {} : { from_class_id: "From class is required." }),
        ...(to_class_id ? {} : { to_class_id: "To class is required." }),
      },
    });
  }

  if (from_class_id === to_class_id) {
    return sendError(res, 422, "From and to classes must be different.", "VALIDATION_ERROR");
  }

  const classMap = await loadClassMap(schoolId);
  const fromClass = classMap.byId.get(from_class_id);
  const toClass = classMap.byId.get(to_class_id);

  if (!fromClass || !toClass) {
    return sendError(res, 422, "One or both classes were not found in your school.", "VALIDATION_ERROR");
  }

  const activeStudents = await pool.query<{ id: string; full_name: string }>(
    `SELECT id, full_name FROM students
     WHERE school_id = $1 AND current_class_id = $2 AND status = 'active'`,
    [schoolId, from_class_id],
  );

  if (!activeStudents.rowCount) {
    return sendError(res, 404, "No active students found in this class.", "NOT_FOUND");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const student of activeStudents.rows) {
      await client.query(
        `UPDATE student_class_history
         SET left_at = NOW(), reason = $1
         WHERE student_id = $2 AND school_id = $3 AND left_at IS NULL`,
        [reason, student.id, schoolId],
      );

      await client.query(
        `UPDATE students
         SET current_class_id = $1, updated_at = NOW()
         WHERE id = $2 AND school_id = $3`,
        [to_class_id, student.id, schoolId],
      );

      await client.query(
        `INSERT INTO student_class_history (
           id, school_id, student_id, class_id, enrolled_at, reason, moved_by
         ) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), $4, $5)`,
        [schoolId, student.id, to_class_id, reason, actor.sub],
      );
    }

    await client.query("COMMIT");

    return res.json({
      data: {
        message: `${activeStudents.rowCount} students have been promoted from ${fromClass.name} to ${toClass.name}.`,
        count: activeStudents.rowCount,
      },
    });
  } catch {
    await client.query("ROLLBACK");
    return sendError(res, 500, "Something went wrong. Please try again.", "SERVER_ERROR");
  } finally {
    client.release();
  }
});

studentsRouter.get("/", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  if (!schoolId) {
    return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  }

  const search = (req.query.search as string | undefined)?.trim();
  const classId = req.query.class_id as string | undefined;
  const gender = req.query.gender as string | undefined;
  const status = (req.query.status as string | undefined) ?? "active";
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 25)));
  const offset = (page - 1) * limit;

  const conditions = ["s.school_id = $1", "s.status = $2"];
  const params: unknown[] = [schoolId, status];
  let paramIndex = 3;

  if (classId) {
    conditions.push(`s.current_class_id = $${paramIndex}`);
    params.push(classId);
    paramIndex += 1;
  }

  if (gender && GENDERS.has(gender)) {
    conditions.push(`s.gender = $${paramIndex}`);
    params.push(gender);
    paramIndex += 1;
  }

  if (search) {
    conditions.push(
      `(s.full_name ILIKE $${paramIndex} OR s.learner_id ILIKE $${paramIndex})`,
    );
    params.push(`%${search}%`);
    paramIndex += 1;
  }

  const whereClause = conditions.join(" AND ");

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM students s WHERE ${whereClause}`,
    params,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const listParams = [...params, limit, offset];
  const result = await pool.query(
    `SELECT
       s.id,
       s.learner_id,
       s.full_name,
       s.date_of_birth,
       s.gender,
       s.photo_url,
       s.status,
       s.created_at,
       sc.level || COALESCE(sc.stream, '') AS class_name,
       sc.id AS class_id,
       sg.full_name AS guardian_name,
       sg.phone AS guardian_phone
     FROM students s
     LEFT JOIN school_classes sc ON sc.id = s.current_class_id
     LEFT JOIN student_guardians sg ON sg.student_id = s.id AND sg.is_primary = true
     WHERE ${whereClause}
     ORDER BY s.full_name ASC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    listParams,
  );

  return res.json({
    data: {
      students: result.rows.map(mapListRow),
      total,
      page,
      limit,
    },
  });
});

studentsRouter.post(
  "/",
  photoUpload.single("photo"),
  async (req: AuthenticatedTenantRequest, res) => {
    const schoolId = req.schoolId;
    const actor = req.tenantUser;

    if (!schoolId || !actor) {
      return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
    }

    if (!can(actor.role, "manageUsers")) {
      return sendError(res, 403, "You do not have permission to register students.", "FORBIDDEN");
    }

    const body = req.body as Record<string, string | undefined>;
    const input: StudentFormInput = {
      full_name: body.full_name,
      date_of_birth: body.date_of_birth || null,
      gender: body.gender || null,
      class_id: body.class_id,
      guardian_name: body.guardian_name,
      guardian_phone: body.guardian_phone || null,
      guardian_email: body.guardian_email || null,
      guardian_relationship: body.guardian_relationship || "parent",
    };

    const fields = await validateStudentFields(schoolId, input, {
      requireName: true,
      requireClass: true,
      requireGuardian: true,
    });

    if (req.file && !ALLOWED_STUDENT_PHOTO_TYPES.has(req.file.mimetype)) {
      fields.photo = "Photo must be a JPEG, PNG, or WebP image.";
    }

    if (Object.keys(fields).length > 0) {
      return sendError(
        res,
        422,
        "Please fix the highlighted fields and try again.",
        "VALIDATION_ERROR",
        { fields },
      );
    }

    const studentId = randomUUID();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const learnerId = await generateLearnerId(schoolId, client);

      let photoUrl: string | null = null;
      if (req.file) {
        photoUrl = await saveStudentPhoto(
          schoolId,
          studentId,
          req.file.buffer,
          req.file.mimetype,
        );
      }

      await client.query(
        `INSERT INTO students (
           id, school_id, learner_id, full_name, date_of_birth, gender, photo_url,
           current_class_id, status, created_by, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, NOW(), NOW())`,
        [
          studentId,
          schoolId,
          learnerId,
          input.full_name!.trim(),
          input.date_of_birth || null,
          input.gender || null,
          photoUrl,
          input.class_id,
          actor.sub,
        ],
      );

      await client.query(
        `INSERT INTO student_guardians (
           id, school_id, student_id, full_name, phone, email, relationship, is_primary
         ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true)`,
        [
          schoolId,
          studentId,
          input.guardian_name!.trim(),
          input.guardian_phone?.trim() || null,
          input.guardian_email?.trim() || null,
          normalizeRelationship(input.guardian_relationship),
        ],
      );

      await client.query(
        `INSERT INTO student_class_history (
           id, school_id, student_id, class_id, enrolled_at, reason, moved_by
         ) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), 'initial_enrollment', $4)`,
        [schoolId, studentId, input.class_id, actor.sub],
      );

      await client.query("COMMIT");

      const classMap = await loadClassMap(schoolId);
      const classInfo = classMap.byId.get(input.class_id!);

      return res.status(201).json({
        data: {
          student: {
            id: studentId,
            learner_id: learnerId,
            full_name: input.full_name!.trim(),
            class_name: classInfo?.name ?? null,
            guardian_name: input.guardian_name!.trim(),
            guardian_phone: input.guardian_phone?.trim() || null,
          },
        },
      });
    } catch {
      await client.query("ROLLBACK");
      return sendError(res, 500, "Something went wrong. Please try again.", "SERVER_ERROR");
    } finally {
      client.release();
    }
  },
);

studentsRouter.get("/:id", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  const studentId = String(req.params.id);

  if (!schoolId) {
    return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  }

  const student = await fetchStudentDetail(schoolId, studentId);
  if (!student) {
    return sendError(res, 404, "Student not found in your school.", "NOT_FOUND");
  }

  return res.json({ data: student });
});

studentsRouter.patch("/:id", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  const actor = req.tenantUser;
  const studentId = String(req.params.id);

  if (!schoolId || !actor) {
    return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  }

  if (!can(actor.role, "manageUsers")) {
    return sendError(res, 403, "You do not have permission to update students.", "FORBIDDEN");
  }

  if ("class_id" in req.body) {
    return sendError(
      res,
      400,
      "Use the class transfer endpoint to move a student to a different class.",
      "VALIDATION_ERROR",
    );
  }

  const body = req.body as StudentFormInput;
  const fields = await validateStudentFields(schoolId, body);

  if (Object.keys(fields).length > 0) {
    return sendError(
      res,
      422,
      "Please fix the highlighted fields and try again.",
      "VALIDATION_ERROR",
      { fields },
    );
  }

  const existing = await pool.query(
    "SELECT id FROM students WHERE id = $1 AND school_id = $2 LIMIT 1",
    [studentId, schoolId],
  );
  if (!existing.rowCount) {
    return sendError(res, 404, "Student not found in your school.", "NOT_FOUND");
  }

  const updates: string[] = [];
  const params: unknown[] = [];
  let index = 1;

  if (body.full_name !== undefined) {
    updates.push(`full_name = $${index}`);
    params.push(body.full_name.trim());
    index += 1;
  }
  if (body.date_of_birth !== undefined) {
    updates.push(`date_of_birth = $${index}`);
    params.push(body.date_of_birth || null);
    index += 1;
  }
  if (body.gender !== undefined) {
    updates.push(`gender = $${index}`);
    params.push(body.gender || null);
    index += 1;
  }

  if (updates.length > 0) {
    updates.push("updated_at = NOW()");
    params.push(studentId, schoolId);
    await pool.query(
      `UPDATE students SET ${updates.join(", ")} WHERE id = $${index} AND school_id = $${index + 1}`,
      params,
    );
  }

  if (
    body.guardian_name !== undefined ||
    body.guardian_phone !== undefined ||
    body.guardian_email !== undefined ||
    body.guardian_relationship !== undefined
  ) {
    await pool.query(
      `UPDATE student_guardians
       SET full_name = COALESCE($1, full_name),
           phone = COALESCE($2, phone),
           email = COALESCE($3, email),
           relationship = COALESCE($4, relationship)
       WHERE student_id = $5 AND school_id = $6 AND is_primary = true`,
      [
        body.guardian_name?.trim() ?? null,
        body.guardian_phone?.trim() ?? null,
        body.guardian_email?.trim() ?? null,
        body.guardian_relationship ? normalizeRelationship(body.guardian_relationship) : null,
        studentId,
        schoolId,
      ],
    );
  }

  const student = await fetchStudentDetail(schoolId, studentId);
  return res.json({ data: student });
});

studentsRouter.patch("/:id/transfer", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  const actor = req.tenantUser;
  const studentId = String(req.params.id);

  if (!schoolId || !actor) {
    return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  }

  if (!can(actor.role, "manageUsers")) {
    return sendError(res, 403, "You do not have permission to transfer students.", "FORBIDDEN");
  }

  const { new_class_id, reason = "transfer" } = req.body as {
    new_class_id?: string;
    reason?: string;
  };

  if (!new_class_id) {
    return sendError(res, 422, "New class is required.", "VALIDATION_ERROR", {
      fields: { new_class_id: "Please select a new class." },
    });
  }

  const studentResult = await pool.query<{
    id: string;
    full_name: string;
    current_class_id: string | null;
    level: string | null;
    stream: string | null;
  }>(
    `SELECT s.id, s.full_name, s.current_class_id, sc.level, sc.stream
     FROM students s
     LEFT JOIN school_classes sc ON sc.id = s.current_class_id
     WHERE s.id = $1 AND s.school_id = $2`,
    [studentId, schoolId],
  );

  const student = studentResult.rows[0];
  if (!student) {
    return sendError(res, 404, "Student not found in your school.", "NOT_FOUND");
  }

  if (student.current_class_id === new_class_id) {
    return sendError(res, 409, "Student is already in this class.", "CONFLICT");
  }

  const classMap = await loadClassMap(schoolId);
  const newClass = classMap.byId.get(new_class_id);
  if (!newClass) {
    return sendError(res, 422, "The selected class does not exist in your school.", "VALIDATION_ERROR");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE student_class_history
       SET left_at = NOW(), reason = $1
       WHERE student_id = $2 AND school_id = $3 AND left_at IS NULL`,
      [reason, studentId, schoolId],
    );

    await client.query(
      `UPDATE students
       SET current_class_id = $1, updated_at = NOW()
       WHERE id = $2 AND school_id = $3`,
      [new_class_id, studentId, schoolId],
    );

    await client.query(
      `INSERT INTO student_class_history (
         id, school_id, student_id, class_id, enrolled_at, reason, moved_by
       ) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), $4, $5)`,
      [schoolId, studentId, new_class_id, reason, actor.sub],
    );

    await client.query("COMMIT");

    const updated = await fetchStudentDetail(schoolId, studentId);

    return res.json({
      data: {
        message: `${student.full_name} has been moved to ${newClass.name}.`,
        student: updated,
      },
    });
  } catch {
    await client.query("ROLLBACK");
    return sendError(res, 500, "Something went wrong. Please try again.", "SERVER_ERROR");
  } finally {
    client.release();
  }
});

studentsRouter.patch("/:id/withdraw", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  const actor = req.tenantUser;
  const studentId = String(req.params.id);

  if (!schoolId || !actor) {
    return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  }

  if (!can(actor.role, "manageUsers")) {
    return sendError(res, 403, "You do not have permission to withdraw students.", "FORBIDDEN");
  }

  const studentResult = await pool.query<{ id: string; full_name: string; status: string }>(
    "SELECT id, full_name, status FROM students WHERE id = $1 AND school_id = $2",
    [studentId, schoolId],
  );
  const student = studentResult.rows[0];

  if (!student) {
    return sendError(res, 404, "Student not found in your school.", "NOT_FOUND");
  }

  if (student.status === "withdrawn") {
    return sendError(res, 409, "This student has already been withdrawn.", "ALREADY_WITHDRAWN");
  }

  const { reason } = req.body as { reason?: string };
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE students
       SET status = 'withdrawn',
           withdrawn_at = NOW(),
           withdrawal_reason = $1,
           updated_at = NOW()
       WHERE id = $2 AND school_id = $3`,
      [reason?.trim() || null, studentId, schoolId],
    );

    await client.query(
      `UPDATE student_class_history
       SET left_at = NOW(), reason = 'withdrawal'
       WHERE student_id = $1 AND school_id = $2 AND left_at IS NULL`,
      [studentId, schoolId],
    );

    await client.query("COMMIT");

    const updated = await fetchStudentDetail(schoolId, studentId);

    return res.json({
      data: {
        message: `${student.full_name} has been withdrawn. Their records are preserved.`,
        student: updated,
      },
    });
  } catch {
    await client.query("ROLLBACK");
    return sendError(res, 500, "Something went wrong. Please try again.", "SERVER_ERROR");
  } finally {
    client.release();
  }
});

studentsRouter.patch("/:id/reinstate", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  const actor = req.tenantUser;
  const studentId = String(req.params.id);

  if (!schoolId || !actor) {
    return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  }

  if (!can(actor.role, "manageUsers")) {
    return sendError(res, 403, "You do not have permission to reinstate students.", "FORBIDDEN");
  }

  const { class_id } = req.body as { class_id?: string };

  if (!class_id) {
    return sendError(res, 422, "A class is required to reinstate a student.", "VALIDATION_ERROR", {
      fields: { class_id: "Please select a class." },
    });
  }

  const classCheck = await pool.query(
    "SELECT 1 FROM school_classes WHERE id = $1 AND school_id = $2 LIMIT 1",
    [class_id, schoolId],
  );
  if (!classCheck.rowCount) {
    return sendError(res, 422, "The selected class does not exist in your school.", "VALIDATION_ERROR");
  }

  const studentResult = await pool.query<{ id: string; full_name: string; status: string }>(
    "SELECT id, full_name, status FROM students WHERE id = $1 AND school_id = $2",
    [studentId, schoolId],
  );
  const student = studentResult.rows[0];

  if (!student) {
    return sendError(res, 404, "Student not found in your school.", "NOT_FOUND");
  }

  if (student.status === "active") {
    return sendError(res, 409, "This student is already active.", "ALREADY_ACTIVE");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE students
       SET status = 'active',
           withdrawn_at = NULL,
           withdrawal_reason = NULL,
           current_class_id = $1,
           updated_at = NOW()
       WHERE id = $2 AND school_id = $3`,
      [class_id, studentId, schoolId],
    );

    await client.query(
      `INSERT INTO student_class_history (
         id, school_id, student_id, class_id, enrolled_at, reason, moved_by
       ) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), 'reinstatement', $4)`,
      [schoolId, studentId, class_id, actor.sub],
    );

    await client.query("COMMIT");

    const updated = await fetchStudentDetail(schoolId, studentId);

    return res.json({
      data: {
        message: `${student.full_name} has been reinstated.`,
        student: updated,
      },
    });
  } catch {
    await client.query("ROLLBACK");
    return sendError(res, 500, "Something went wrong. Please try again.", "SERVER_ERROR");
  } finally {
    client.release();
  }
});
