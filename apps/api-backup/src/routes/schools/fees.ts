import type { Response } from "express";
import { Router } from "express";
import { can } from "@makyschool/shared/constants";
import { pool } from "../../db/pool.js";
import { USER_DISPLAY_NAME_SQL } from "../../db/userSql.js";
import { sendFeeReceiptPdf } from "../../lib/feeReceiptPdf.js";
import {
  computeFeeAccountStatus,
  formatClassName,
  formatUGX,
  generateReceiptNumber,
} from "../../lib/receiptNumberGenerator.js";
import type { AuthenticatedTenantRequest } from "../../middleware/tenantAuth.js";

export const feesRouter = Router();

const PAYMENT_METHODS = ["cash", "bank_transfer", "mobile_money", "cheque", "other"] as const;

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

function requirePermission(
  req: AuthenticatedTenantRequest,
  res: Response,
  action: Parameters<typeof can>[1],
) {
  const actor = req.tenantUser;
  if (!actor || !can(actor.role, action)) {
    sendError(res, 403, "You do not have permission to perform this action.", "FORBIDDEN");
    return false;
  }
  return true;
}

async function recalculateFeeAccount(client: import("pg").PoolClient, accountId: string) {
  const accountResult = await client.query<{
    amount_owed: string;
    waived_by: string | null;
  }>(
    "SELECT amount_owed, waived_by FROM student_fee_accounts WHERE id = $1 LIMIT 1",
    [accountId],
  );
  const account = accountResult.rows[0];
  if (!account) return;

  const paidResult = await client.query<{ total: string }>(
    `SELECT COALESCE(SUM(amount), 0)::bigint AS total
     FROM fee_payments
     WHERE fee_account_id = $1 AND voided = false`,
    [accountId],
  );
  const amountPaid = Number(paidResult.rows[0]?.total ?? 0);
  const amountOwed = Number(account.amount_owed);
  const status = computeFeeAccountStatus(amountOwed, amountPaid, Boolean(account.waived_by));

  await client.query(
    `UPDATE student_fee_accounts
     SET amount_paid = $1, status = $2, updated_at = NOW()
     WHERE id = $3`,
    [amountPaid, status, accountId],
  );
}

feesRouter.get("/structures", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  if (!schoolId) return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  if (!requirePermission(req, res, "viewFees")) return;

  const academicYear = req.query.academic_year as string | undefined;
  const termName = req.query.term_name as string | undefined;
  const classId = req.query.class_id as string | undefined;

  const conditions = ["fs.school_id = $1"];
  const params: unknown[] = [schoolId];
  let idx = 2;

  if (academicYear) {
    conditions.push(`fs.academic_year = $${idx}`);
    params.push(Number(academicYear));
    idx += 1;
  }
  if (termName) {
    conditions.push(`fs.term_name = $${idx}`);
    params.push(termName);
    idx += 1;
  }
  if (classId) {
    conditions.push(`fs.class_id = $${idx}`);
    params.push(classId);
    idx += 1;
  }

  const result = await pool.query(
    `SELECT
       fs.*,
       sc.level,
       sc.stream,
       sc.level || COALESCE(sc.stream, '') AS class_name,
       COUNT(sfa.id)::int AS student_count,
       COALESCE(SUM(sfa.amount_owed), 0)::bigint AS total_owed,
       COALESCE(SUM(sfa.amount_paid), 0)::bigint AS total_collected,
       COALESCE(SUM(sfa.balance), 0)::bigint AS total_outstanding
     FROM fee_structures fs
     JOIN school_classes sc ON sc.id = fs.class_id
     LEFT JOIN student_fee_accounts sfa ON sfa.fee_structure_id = fs.id
     WHERE ${conditions.join(" AND ")}
     GROUP BY fs.id, sc.level, sc.stream
     ORDER BY fs.academic_year DESC, fs.term_name, sc.level`,
    params,
  );

  return res.json({ data: result.rows });
});

feesRouter.post("/structures", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  const actor = req.tenantUser;
  if (!schoolId || !actor) return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  if (!requirePermission(req, res, "manageFees")) return;

  const { class_id, term_name, academic_year, amount, description } = req.body as {
    class_id?: string;
    term_name?: string;
    academic_year?: number;
    amount?: number;
    description?: string;
  };

  const fields: Record<string, string> = {};
  if (!class_id) fields.class_id = "Class is required.";
  if (!term_name?.trim()) fields.term_name = "Term name is required.";
  if (!academic_year || !Number.isInteger(Number(academic_year))) {
    fields.academic_year = "Academic year is required.";
  }
  if (!amount || !Number.isInteger(amount) || amount <= 0) {
    fields.amount = "Amount must be a positive whole number.";
  }
  if (Object.keys(fields).length > 0) {
    return sendError(res, 422, "Please fix the highlighted fields.", "VALIDATION_ERROR", fields);
  }

  const classCheck = await pool.query<{ level: string; stream: string | null }>(
    "SELECT level, stream FROM school_classes WHERE id = $1 AND school_id = $2 LIMIT 1",
    [class_id, schoolId],
  );
  if (!classCheck.rowCount) {
    return sendError(res, 422, "Class not found in your school.", "VALIDATION_ERROR", {
      class_id: "Class not found in your school.",
    });
  }

  const duplicate = await pool.query(
    `SELECT 1 FROM fee_structures
     WHERE school_id = $1 AND class_id = $2 AND term_name = $3 AND academic_year = $4
     LIMIT 1`,
    [schoolId, class_id, term_name!.trim(), academic_year],
  );
  if (duplicate.rowCount) {
    const className = formatClassName(classCheck.rows[0]!.level, classCheck.rows[0]!.stream);
    return sendError(
      res,
      409,
      `A fee structure for ${className} in ${term_name!.trim()} already exists. Edit the existing one instead.`,
      "CONFLICT",
    );
  }

  const insert = await pool.query(
    `INSERT INTO fee_structures (
       school_id, class_id, term_name, academic_year, amount, description, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [schoolId, class_id, term_name!.trim(), academic_year, amount, description?.trim() || null, actor.sub],
  );

  return res.status(201).json({ data: insert.rows[0] });
});

feesRouter.patch("/structures/:id", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  if (!schoolId) return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  if (!requirePermission(req, res, "manageFees")) return;

  const structureId = String(req.params.id);
  const { amount, description, is_active } = req.body as {
    amount?: number;
    description?: string | null;
    is_active?: boolean;
  };

  const existing = await pool.query(
    "SELECT * FROM fee_structures WHERE id = $1 AND school_id = $2 LIMIT 1",
    [structureId, schoolId],
  );
  if (!existing.rowCount) {
    return sendError(res, 404, "Fee structure not found.", "NOT_FOUND");
  }

  if (amount !== undefined && (!Number.isInteger(amount) || amount <= 0)) {
    return sendError(res, 422, "Amount must be a positive whole number.", "VALIDATION_ERROR", {
      amount: "Amount must be a positive whole number.",
    });
  }

  const updated = await pool.query(
    `UPDATE fee_structures
     SET amount = COALESCE($1, amount),
         description = COALESCE($2, description),
         is_active = COALESCE($3, is_active),
         updated_at = NOW()
     WHERE id = $4 AND school_id = $5
     RETURNING *`,
    [amount ?? null, description === undefined ? null : description, is_active ?? null, structureId, schoolId],
  );

  const accountCount = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::int AS count FROM student_fee_accounts WHERE fee_structure_id = $1",
    [structureId],
  );
  const count = Number(accountCount.rows[0]?.count ?? 0);
  const amountChanged = amount !== undefined && amount !== Number(existing.rows[0].amount);

  return res.json({
    data: {
      fee_structure: updated.rows[0],
      ...(amountChanged && count > 0
        ? {
            warning: `Amount updated. ${count} existing student fee accounts still use the old amount. Use 'Sync accounts' to update them.`,
          }
        : {}),
    },
  });
});

feesRouter.post("/structures/:id/assign", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  if (!schoolId) return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  if (!requirePermission(req, res, "manageFees")) return;

  const structureId = String(req.params.id);
  const structure = await pool.query<{ class_id: string; amount: string }>(
    "SELECT class_id, amount FROM fee_structures WHERE id = $1 AND school_id = $2 LIMIT 1",
    [structureId, schoolId],
  );
  if (!structure.rowCount) {
    return sendError(res, 404, "Fee structure not found.", "NOT_FOUND");
  }

  const classId = structure.rows[0]!.class_id;
  const amount = Number(structure.rows[0]!.amount);

  const totalResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM students
     WHERE school_id = $1 AND current_class_id = $2 AND status = 'active'`,
    [schoolId, classId],
  );
  const totalStudents = Number(totalResult.rows[0]?.count ?? 0);

  const existingResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM student_fee_accounts sfa
     JOIN students s ON s.id = sfa.student_id
     WHERE sfa.fee_structure_id = $1 AND s.school_id = $2 AND s.current_class_id = $3 AND s.status = 'active'`,
    [structureId, schoolId, classId],
  );
  const alreadyHad = Number(existingResult.rows[0]?.count ?? 0);

  const insert = await pool.query(
    `INSERT INTO student_fee_accounts (school_id, student_id, fee_structure_id, amount_owed, status)
     SELECT $1, s.id, $2, $3, 'unpaid'
     FROM students s
     WHERE s.current_class_id = $4
       AND s.school_id = $1
       AND s.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM student_fee_accounts sfa
         WHERE sfa.student_id = s.id AND sfa.fee_structure_id = $2
       )
     RETURNING id`,
    [schoolId, structureId, amount, classId],
  );

  return res.json({
    data: {
      assigned: insert.rowCount ?? 0,
      already_had_account: alreadyHad,
      total_students: totalStudents,
    },
  });
});

feesRouter.post("/structures/:id/sync-accounts", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  if (!schoolId) return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  if (!requirePermission(req, res, "manageFees")) return;

  const structureId = String(req.params.id);
  const structure = await pool.query<{ amount: string }>(
    "SELECT amount FROM fee_structures WHERE id = $1 AND school_id = $2 LIMIT 1",
    [structureId, schoolId],
  );
  if (!structure.rowCount) {
    return sendError(res, 404, "Fee structure not found.", "NOT_FOUND");
  }

  const amount = Number(structure.rows[0]!.amount);
  const updated = await pool.query(
    `UPDATE student_fee_accounts
     SET amount_owed = $1, updated_at = NOW()
     WHERE fee_structure_id = $2 AND school_id = $3 AND waived_by IS NULL
     RETURNING id`,
    [amount, structureId, schoolId],
  );

  for (const row of updated.rows) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await recalculateFeeAccount(client, row.id);
      await client.query("COMMIT");
    } catch {
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  }

  return res.json({ data: { synced: updated.rowCount ?? 0 } });
});

feesRouter.get("/payments", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  if (!schoolId) return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  if (!requirePermission(req, res, "viewFees")) return;

  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 25)));
  const offset = (page - 1) * limit;

  const conditions = ["fp.school_id = $1"];
  const params: unknown[] = [schoolId];
  let idx = 2;

  const filters: Array<[string, unknown]> = [
    ["student_id", req.query.student_id],
    ["class_id", req.query.class_id],
    ["term_name", req.query.term_name],
    ["academic_year", req.query.academic_year ? Number(req.query.academic_year) : undefined],
    ["payment_method", req.query.payment_method],
    ["date_from", req.query.date_from],
    ["date_to", req.query.date_to],
  ];

  for (const [key, value] of filters) {
    if (!value) continue;
    if (key === "class_id") {
      conditions.push(`s.current_class_id = $${idx}`);
    } else if (key === "term_name") {
      conditions.push(`fs.term_name = $${idx}`);
    } else if (key === "academic_year") {
      conditions.push(`fs.academic_year = $${idx}`);
    } else if (key === "student_id") {
      conditions.push(`fp.student_id = $${idx}`);
    } else if (key === "payment_method") {
      conditions.push(`fp.payment_method = $${idx}`);
    } else if (key === "date_from") {
      conditions.push(`fp.payment_date >= $${idx}`);
    } else if (key === "date_to") {
      conditions.push(`fp.payment_date <= $${idx}`);
    }
    params.push(value);
    idx += 1;
  }

  const status = req.query.status as string | undefined;
  if (status === "voided") {
    conditions.push("fp.voided = true");
  } else if (status === "active") {
    conditions.push("fp.voided = false");
  }

  const where = conditions.join(" AND ");

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::int AS count
     FROM fee_payments fp
     JOIN students s ON s.id = fp.student_id
     JOIN student_fee_accounts sfa ON sfa.id = fp.fee_account_id
     JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
     WHERE ${where}`,
    params,
  );

  const listParams = [...params, limit, offset];
  const result = await pool.query(
    `SELECT
       fp.*,
       s.full_name AS student_name,
       s.learner_id,
       sc.level,
       sc.stream,
       fs.term_name,
       fs.academic_year,
       COALESCE(recorder.name, recorder.full_name) AS recorded_by_name
     FROM fee_payments fp
     JOIN students s ON s.id = fp.student_id
     JOIN student_fee_accounts sfa ON sfa.id = fp.fee_account_id
     JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
     LEFT JOIN school_classes sc ON sc.id = s.current_class_id
     LEFT JOIN users recorder ON recorder.id = fp.recorded_by
     WHERE ${where}
     ORDER BY fp.payment_date DESC, fp.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    listParams,
  );

  return res.json({
    data: {
      payments: result.rows.map((row) => ({
        ...row,
        class_name: formatClassName(row.level ?? "", row.stream),
      })),
      total: Number(countResult.rows[0]?.count ?? 0),
      page,
      limit,
    },
  });
});

feesRouter.post("/payments", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  const actor = req.tenantUser;
  if (!schoolId || !actor) return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  if (!requirePermission(req, res, "recordPayments")) return;

  const {
    student_id,
    fee_structure_id,
    amount,
    payment_method = "cash",
    payment_reference,
    payment_date,
    notes,
  } = req.body as {
    student_id?: string;
    fee_structure_id?: string;
    amount?: number;
    payment_method?: (typeof PAYMENT_METHODS)[number];
    payment_reference?: string;
    payment_date?: string;
    notes?: string;
  };

  const fields: Record<string, string> = {};
  if (!student_id) fields.student_id = "Student is required.";
  if (!fee_structure_id) fields.fee_structure_id = "Fee structure is required.";
  if (!amount || !Number.isInteger(amount) || amount <= 0) {
    fields.amount = "Amount must be a positive whole number.";
  }
  if (!PAYMENT_METHODS.includes(payment_method)) {
    fields.payment_method = "Invalid payment method.";
  }
  if (Object.keys(fields).length > 0) {
    return sendError(res, 422, "Please fix the highlighted fields.", "VALIDATION_ERROR", fields);
  }

  const student = await pool.query<{ full_name: string; learner_id: string }>(
    "SELECT full_name, learner_id FROM students WHERE id = $1 AND school_id = $2 LIMIT 1",
    [student_id, schoolId],
  );
  if (!student.rowCount) {
    return sendError(res, 404, "Student not found in your school.", "NOT_FOUND");
  }

  const structure = await pool.query<{ term_name: string; level: string; stream: string | null }>(
    `SELECT fs.term_name, sc.level, sc.stream
     FROM fee_structures fs
     JOIN school_classes sc ON sc.id = fs.class_id
     WHERE fs.id = $1 AND fs.school_id = $2
     LIMIT 1`,
    [fee_structure_id, schoolId],
  );
  if (!structure.rowCount) {
    return sendError(res, 404, "Fee structure not found.", "NOT_FOUND");
  }

  const account = await pool.query<{
    id: string;
    amount_owed: string;
    amount_paid: string;
    balance: string;
    status: string;
    waived_by: string | null;
  }>(
    `SELECT id, amount_owed, amount_paid, balance, status, waived_by
     FROM student_fee_accounts
     WHERE student_id = $1 AND fee_structure_id = $2 AND school_id = $3
     LIMIT 1`,
    [student_id, fee_structure_id, schoolId],
  );
  if (!account.rowCount) {
    return sendError(
      res,
      404,
      "This student has not been assigned this fee structure. Assign the fee structure to their class first.",
      "NOT_FOUND",
    );
  }

  const feeAccount = account.rows[0]!;
  if (feeAccount.waived_by) {
    return sendError(res, 422, "This fee account has been waived.", "ALREADY_WAIVED");
  }

  const balance = Number(feeAccount.balance);
  if (amount! > balance) {
    return sendError(
      res,
      422,
      `Payment of ${formatUGX(amount!)} exceeds the outstanding balance of ${formatUGX(balance)}. Record ${formatUGX(balance)} or less, or contact admin to waive the remainder.`,
      "OVERPAYMENT",
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const receiptNumber = await generateReceiptNumber(schoolId, client);
    const paymentDate = payment_date ? payment_date.slice(0, 10) : new Date().toISOString().slice(0, 10);

    const paymentInsert = await client.query<{ id: string }>(
      `INSERT INTO fee_payments (
         school_id, student_id, fee_account_id, receipt_number, amount,
         payment_method, payment_reference, payment_date, notes, recorded_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        schoolId,
        student_id,
        feeAccount.id,
        receiptNumber,
        amount,
        payment_method,
        payment_reference?.trim() || null,
        paymentDate,
        notes?.trim() || null,
        actor.sub,
      ],
    );

    await recalculateFeeAccount(client, feeAccount.id);

    const updatedAccount = await client.query(
      "SELECT amount_owed, amount_paid, balance, status FROM student_fee_accounts WHERE id = $1",
      [feeAccount.id],
    );

    await client.query("COMMIT");

    const className = formatClassName(structure.rows[0]!.level, structure.rows[0]!.stream);
    const accountRow = updatedAccount.rows[0];

    return res.status(201).json({
      data: {
        payment: {
          id: paymentInsert.rows[0]!.id,
          receipt_number: receiptNumber,
          amount,
          student_name: student.rows[0]!.full_name,
          class_name: className,
          term_name: structure.rows[0]!.term_name,
          payment_method,
          payment_date: paymentDate,
        },
        account: {
          amount_owed: Number(accountRow.amount_owed),
          amount_paid: Number(accountRow.amount_paid),
          balance: Number(accountRow.balance),
          status: accountRow.status,
        },
      },
    });
  } catch {
    await client.query("ROLLBACK");
    return sendError(res, 500, "Something went wrong. Please try again.", "SERVER_ERROR");
  } finally {
    client.release();
  }
});

feesRouter.post("/payments/:id/void", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  const actor = req.tenantUser;
  if (!schoolId || !actor) return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  if (!requirePermission(req, res, "voidPayments")) return;

  const paymentId = String(req.params.id);
  const { reason } = req.body as { reason?: string };
  if (!reason?.trim()) {
    return sendError(res, 422, "A reason is required to void a payment.", "VALIDATION_ERROR", {
      reason: "A reason is required.",
    });
  }

  const payment = await pool.query<{ id: string; voided: boolean; fee_account_id: string }>(
    "SELECT id, voided, fee_account_id FROM fee_payments WHERE id = $1 AND school_id = $2 LIMIT 1",
    [paymentId, schoolId],
  );
  if (!payment.rowCount) {
    return sendError(res, 404, "Payment not found.", "NOT_FOUND");
  }
  if (payment.rows[0]!.voided) {
    return sendError(res, 409, "This payment has already been voided.", "ALREADY_VOIDED");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE fee_payments
       SET voided = true, voided_at = NOW(), voided_by = $1, void_reason = $2
       WHERE id = $3`,
      [actor.sub, reason.trim(), paymentId],
    );
    await recalculateFeeAccount(client, payment.rows[0]!.fee_account_id);
    const updatedPayment = await client.query("SELECT * FROM fee_payments WHERE id = $1", [paymentId]);
    const updatedAccount = await client.query(
      "SELECT * FROM student_fee_accounts WHERE id = $1",
      [payment.rows[0]!.fee_account_id],
    );
    await client.query("COMMIT");

    return res.json({
      data: {
        payment: updatedPayment.rows[0],
        account: updatedAccount.rows[0],
      },
    });
  } catch {
    await client.query("ROLLBACK");
    return sendError(res, 500, "Something went wrong. Please try again.", "SERVER_ERROR");
  } finally {
    client.release();
  }
});

feesRouter.get("/accounts/student/:studentId", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  if (!schoolId) return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  if (!requirePermission(req, res, "viewFees")) return;

  const studentId = String(req.params.studentId);
  const student = await pool.query(
    "SELECT id FROM students WHERE id = $1 AND school_id = $2 LIMIT 1",
    [studentId, schoolId],
  );
  if (!student.rowCount) {
    return sendError(res, 404, "Student not found.", "NOT_FOUND");
  }

  const accounts = await pool.query(
    `SELECT
       sfa.*,
       fs.term_name,
       fs.academic_year,
       sc.level,
       sc.stream
     FROM student_fee_accounts sfa
     JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
     LEFT JOIN school_classes sc ON sc.id = fs.class_id
     WHERE sfa.student_id = $1 AND sfa.school_id = $2
     ORDER BY fs.academic_year DESC, fs.term_name`,
    [studentId, schoolId],
  );

  const accountIds = accounts.rows.map((row) => row.id);
  let paymentsByAccount = new Map<string, unknown[]>();
  if (accountIds.length > 0) {
    const payments = await pool.query(
      `SELECT id, fee_account_id, receipt_number, amount, payment_date, payment_method, voided
       FROM fee_payments
       WHERE fee_account_id = ANY($1::uuid[]) AND school_id = $2
       ORDER BY payment_date DESC, created_at DESC`,
      [accountIds, schoolId],
    );
    paymentsByAccount = payments.rows.reduce((map, row) => {
      const list = map.get(row.fee_account_id) ?? [];
      list.push({
        id: row.id,
        receipt_number: row.receipt_number,
        amount: Number(row.amount),
        payment_date: row.payment_date,
        payment_method: row.payment_method,
        voided: row.voided,
      });
      map.set(row.fee_account_id, list);
      return map;
    }, new Map<string, unknown[]>());
  }

  return res.json({
    data: {
      accounts: accounts.rows.map((row) => ({
        id: row.id,
        fee_structure_id: row.fee_structure_id,
        term_name: row.term_name,
        academic_year: row.academic_year,
        class_name: formatClassName(row.level ?? "", row.stream),
        amount_owed: Number(row.amount_owed),
        amount_paid: Number(row.amount_paid),
        balance: Number(row.balance),
        status: row.status,
        payments: paymentsByAccount.get(row.id) ?? [],
      })),
    },
  });
});

feesRouter.patch("/accounts/:id/waive", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  const actor = req.tenantUser;
  if (!schoolId || !actor) return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  if (!requirePermission(req, res, "waiveFees")) return;

  const accountId = String(req.params.id);
  const { reason } = req.body as { reason?: string };
  if (!reason?.trim()) {
    return sendError(res, 422, "A reason is required to waive fees.", "VALIDATION_ERROR", {
      reason: "A reason is required.",
    });
  }

  const account = await pool.query(
    "SELECT * FROM student_fee_accounts WHERE id = $1 AND school_id = $2 LIMIT 1",
    [accountId, schoolId],
  );
  if (!account.rowCount) {
    return sendError(res, 404, "Fee account not found.", "NOT_FOUND");
  }
  if (account.rows[0]!.waived_by) {
    return sendError(res, 409, "This fee account has already been waived.", "ALREADY_WAIVED");
  }

  const updated = await pool.query(
    `UPDATE student_fee_accounts
     SET status = 'waived', waived_by = $1, waived_reason = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [actor.sub, reason.trim(), accountId],
  );

  return res.json({ data: updated.rows[0] });
});

feesRouter.get("/outstanding", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  if (!schoolId) return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  if (!requirePermission(req, res, "viewReports")) return;

  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 25)));
  const offset = (page - 1) * limit;

  const conditions = [
    "sfa.school_id = $1",
    "sfa.status IN ('unpaid', 'partial')",
    "sfa.waived_by IS NULL",
  ];
  const params: unknown[] = [schoolId];
  let idx = 2;

  if (req.query.class_id) {
    conditions.push(`s.current_class_id = $${idx}`);
    params.push(req.query.class_id);
    idx += 1;
  }
  if (req.query.term_name) {
    conditions.push(`fs.term_name = $${idx}`);
    params.push(req.query.term_name);
    idx += 1;
  }
  if (req.query.academic_year) {
    conditions.push(`fs.academic_year = $${idx}`);
    params.push(Number(req.query.academic_year));
    idx += 1;
  }

  const statusFilter = req.query.status as string | undefined;
  if (statusFilter === "unpaid" || statusFilter === "partial") {
    conditions.push(`sfa.status = $${idx}`);
    params.push(statusFilter);
    idx += 1;
  }

  const where = conditions.join(" AND ");

  const summary = await pool.query(
    `SELECT
       COUNT(*)::int AS total_students,
       COALESCE(SUM(sfa.balance), 0)::bigint AS total_outstanding,
       COUNT(*) FILTER (WHERE sfa.status = 'unpaid')::int AS unpaid_count,
       COUNT(*) FILTER (WHERE sfa.status = 'partial')::int AS partial_count
     FROM student_fee_accounts sfa
     JOIN students s ON s.id = sfa.student_id
     JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
     LEFT JOIN school_classes sc ON sc.id = s.current_class_id
     WHERE ${where}`,
    params,
  );

  const listParams = [...params, limit, offset];
  const result = await pool.query(
    `SELECT
       s.id AS student_id,
       s.full_name,
       s.learner_id,
       sc.level,
       sc.stream,
       sg.full_name AS guardian_name,
       sg.phone AS guardian_phone,
       sfa.id AS account_id,
       sfa.amount_owed,
       sfa.amount_paid,
       sfa.balance,
       sfa.status,
       fs.term_name,
       fs.academic_year
     FROM student_fee_accounts sfa
     JOIN students s ON s.id = sfa.student_id
     JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
     LEFT JOIN school_classes sc ON sc.id = s.current_class_id
     LEFT JOIN student_guardians sg ON sg.student_id = s.id AND sg.is_primary = true
     WHERE ${where}
     ORDER BY sfa.balance DESC, s.full_name ASC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    listParams,
  );

  return res.json({
    data: {
      students: result.rows.map((row) => ({
        ...row,
        class_name: formatClassName(row.level ?? "", row.stream),
        amount_owed: Number(row.amount_owed),
        amount_paid: Number(row.amount_paid),
        balance: Number(row.balance),
      })),
      summary: {
        total_students: Number(summary.rows[0]?.total_students ?? 0),
        total_outstanding: Number(summary.rows[0]?.total_outstanding ?? 0),
        unpaid_count: Number(summary.rows[0]?.unpaid_count ?? 0),
        partial_count: Number(summary.rows[0]?.partial_count ?? 0),
      },
      page,
      total: Number(summary.rows[0]?.total_students ?? 0),
    },
  });
});

feesRouter.get("/receipts/:paymentId", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  if (!schoolId) return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  if (!requirePermission(req, res, "viewFees")) return;

  const paymentId = String(req.params.paymentId);
  try {
    return await sendFeeReceiptPdf(res, paymentId, schoolId);
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return sendError(res, 404, "Payment not found.", "NOT_FOUND");
    }
    return sendError(res, 500, "Failed to generate receipt PDF.", "SERVER_ERROR");
  }
});

feesRouter.get("/dashboard-stats", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  if (!schoolId) return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  if (!requirePermission(req, res, "viewFees")) return;

  const termName = req.query.term_name as string | undefined;
  const academicYear = req.query.academic_year ? Number(req.query.academic_year) : undefined;

  const conditions = ["sfa.school_id = $1"];
  const params: unknown[] = [schoolId];
  let idx = 2;
  if (termName) {
    conditions.push(`fs.term_name = $${idx}`);
    params.push(termName);
    idx += 1;
  }
  if (academicYear) {
    conditions.push(`fs.academic_year = $${idx}`);
    params.push(academicYear);
    idx += 1;
  }
  const where = conditions.join(" AND ");

  const stats = await pool.query(
    `SELECT
       COALESCE(SUM(sfa.amount_paid), 0)::bigint AS total_collected,
       COALESCE(SUM(CASE WHEN sfa.status IN ('unpaid', 'partial') THEN sfa.balance ELSE 0 END), 0)::bigint AS total_outstanding,
       COUNT(*) FILTER (WHERE sfa.status = 'paid')::int AS students_fully_paid,
       COUNT(*) FILTER (WHERE sfa.status IN ('unpaid', 'partial'))::int AS students_with_balance
     FROM student_fee_accounts sfa
     JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
     WHERE ${where}`,
    params,
  );

  const recent = await pool.query(
    `SELECT
       fp.id,
       fp.receipt_number,
       fp.amount,
       fp.payment_method,
       fp.payment_date,
       fp.voided,
       s.full_name AS student_name
     FROM fee_payments fp
     JOIN students s ON s.id = fp.student_id
     JOIN student_fee_accounts sfa ON sfa.id = fp.fee_account_id
     JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
     WHERE fp.school_id = $1 AND fp.voided = false
     ${termName ? `AND fs.term_name = $2` : ""}
     ${academicYear ? `AND fs.academic_year = $${termName ? 3 : 2}` : ""}
     ORDER BY fp.created_at DESC
     LIMIT 10`,
    termName && academicYear
      ? [schoolId, termName, academicYear]
      : termName
        ? [schoolId, termName]
        : academicYear
          ? [schoolId, academicYear]
          : [schoolId],
  );

  return res.json({
    data: {
      stats: {
        total_collected: Number(stats.rows[0]?.total_collected ?? 0),
        total_outstanding: Number(stats.rows[0]?.total_outstanding ?? 0),
        students_fully_paid: Number(stats.rows[0]?.students_fully_paid ?? 0),
        students_with_balance: Number(stats.rows[0]?.students_with_balance ?? 0),
      },
      recent_payments: recent.rows.map((row) => ({
        ...row,
        amount: Number(row.amount),
      })),
    },
  });
});

feesRouter.post("/reminders/sms", async (req: AuthenticatedTenantRequest, res) => {
  const schoolId = req.schoolId;
  if (!schoolId) return sendError(res, 400, "Missing tenant context.", "VALIDATION_ERROR");
  if (!requirePermission(req, res, "manageFees")) return;

  const { class_id, term_name, academic_year, message } = req.body as {
    class_id?: string;
    term_name?: string;
    academic_year?: number;
    message?: string;
  };

  const conditions = [
    "sfa.school_id = $1",
    "sfa.status IN ('unpaid', 'partial')",
    "sfa.waived_by IS NULL",
    "sg.phone IS NOT NULL",
    "sg.is_primary = true",
  ];
  const params: unknown[] = [schoolId];
  let idx = 2;

  if (class_id) {
    conditions.push(`s.current_class_id = $${idx}`);
    params.push(class_id);
    idx += 1;
  }
  if (term_name) {
    conditions.push(`fs.term_name = $${idx}`);
    params.push(term_name);
    idx += 1;
  }
  if (academic_year) {
    conditions.push(`fs.academic_year = $${idx}`);
    params.push(academic_year);
    idx += 1;
  }

  const recipients = await pool.query(
    `SELECT
       s.full_name AS student_name,
       sc.level,
       sc.stream,
       sg.phone AS guardian_phone,
       sfa.balance,
       fs.term_name,
       sch.name AS school_name
     FROM student_fee_accounts sfa
     JOIN students s ON s.id = sfa.student_id
     JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
     JOIN schools sch ON sch.id = sfa.school_id
     LEFT JOIN school_classes sc ON sc.id = s.current_class_id
     LEFT JOIN student_guardians sg ON sg.student_id = s.id AND sg.is_primary = true
     WHERE ${conditions.join(" AND ")}`,
    params,
  );

  // TODO: Ssekyanzi — SMS integration uses MakyReach from Kweko's Week 1 module
  void message;

  return res.json({
    data: {
      queued: recipients.rowCount ?? 0,
      sent: 0,
      failed: 0,
      message: "MakyReach SMS is not configured yet. Recipients were prepared but not sent.",
      recipients: recipients.rows.map((row) => ({
        student_name: row.student_name,
        guardian_phone: row.guardian_phone,
        class_name: formatClassName(row.level ?? "", row.stream),
        balance: Number(row.balance),
        term_name: row.term_name,
        preview: `Dear Parent of ${row.student_name} (${formatClassName(row.level ?? "", row.stream)}), school fees for ${row.term_name} are outstanding. Amount due: ${formatUGX(row.balance)}. Please pay at the school office. Thank you — ${row.school_name}.`,
      })),
    },
  });
});
