import { subscriptionsEnabled } from "@makyschool/shared/constants";
import { pool } from "../db/pool.js";
import { resolveBillingPeriod } from "./makypay/billing.js";

export type BillingPeriod = {
  term: string;
  year: number;
  source: "calendar" | "heuristic";
  term_start: string | null;
};

export type SubscriptionAuditResult = {
  school_id: string;
  changed: boolean;
  previous_status: string;
  new_status: string;
  required_term: string;
  required_year: number;
  needs_payment: boolean;
};

function isPaidForTerm(
  status: string,
  paidTerm: string | null,
  paidYear: number | null,
  requiredTerm: string,
  requiredYear: number,
) {
  return status === "active" && paidTerm === requiredTerm && paidYear === requiredYear;
}

export async function resolveRequiredBillingPeriod(schoolId: string): Promise<BillingPeriod> {
  const calendarResult = await pool.query<{
    name: string;
    year: number;
    start_date: string;
  }>(
    `SELECT t.name, ay.year, t.start_date
     FROM terms t
     INNER JOIN academic_years ay ON ay.id = t.academic_year_id
     WHERE t.school_id = $1
       AND t.start_date IS NOT NULL
       AND t.start_date <= CURRENT_DATE
     ORDER BY ay.is_current DESC, t.start_date DESC
     LIMIT 1`,
    [schoolId],
  );

  const calendar = calendarResult.rows[0];
  if (calendar) {
    return {
      term: calendar.name,
      year: calendar.year,
      source: "calendar",
      term_start: calendar.start_date,
    };
  }

  const schoolResult = await pool.query<{
    subscription_term: string | null;
    subscription_year: number | null;
  }>("SELECT subscription_term, subscription_year FROM schools WHERE id = $1 LIMIT 1", [schoolId]);

  const school = schoolResult.rows[0];
  const heuristic = resolveBillingPeriod(school?.subscription_term, school?.subscription_year);

  return {
    term: heuristic.term,
    year: heuristic.year,
    source: "heuristic",
    term_start: null,
  };
}

async function logSubscriptionAudit(params: {
  schoolId: string;
  action: string;
  previousStatus: string;
  newStatus: string;
  previousTerm: string | null;
  previousYear: number | null;
  requiredTerm: string;
  requiredYear: number;
  triggeredBy?: string | null;
  notes?: string | null;
}) {
  await pool.query(
    `INSERT INTO subscription_audit_logs (
       id, school_id, action, previous_status, new_status,
       previous_term, previous_year, required_term, required_year,
       triggered_by, notes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      crypto.randomUUID(),
      params.schoolId,
      params.action,
      params.previousStatus,
      params.newStatus,
      params.previousTerm,
      params.previousYear,
      params.requiredTerm,
      params.requiredYear,
      params.triggeredBy ?? null,
      params.notes ?? null,
    ],
  );
}

export async function auditSchoolSubscription(
  schoolId: string,
  options: { triggeredBy?: string; manual?: boolean } = {},
): Promise<SubscriptionAuditResult | null> {
  if (!subscriptionsEnabled()) {
    return null;
  }

  const schoolResult = await pool.query<{
    id: string;
    status: string;
    subscription_status: string;
    subscription_term: string | null;
    subscription_year: number | null;
  }>(
    `SELECT id, status, subscription_status, subscription_term, subscription_year
     FROM schools WHERE id = $1 LIMIT 1`,
    [schoolId],
  );

  const school = schoolResult.rows[0];
  if (!school || school.status === "setup") {
    return null;
  }

  const required = await resolveRequiredBillingPeriod(schoolId);
  const previousStatus = school.subscription_status;
  const previousTerm = school.subscription_term;
  const previousYear = school.subscription_year;

  const paid = isPaidForTerm(
    school.subscription_status,
    school.subscription_term,
    school.subscription_year,
    required.term,
    required.year,
  );

  if (paid) {
    return {
      school_id: schoolId,
      changed: false,
      previous_status: previousStatus,
      new_status: previousStatus,
      required_term: required.term,
      required_year: required.year,
      needs_payment: false,
    };
  }

  let newStatus = school.subscription_status;
  let changed = false;
  let action = "audit_no_change";

  if (options.manual) {
    newStatus = school.subscription_status === "unpaid" ? "unpaid" : "expired";
    changed = true;
    action = "manual_require_payment";
  } else if (school.subscription_status === "active") {
    newStatus = "expired";
    changed = true;
    action = "auto_expire";
  } else if (
    school.subscription_term !== required.term ||
    school.subscription_year !== required.year
  ) {
    newStatus = school.subscription_status === "unpaid" ? "unpaid" : "expired";
    changed = true;
    action = "auto_align_term";
  }

  const termChanged =
    school.subscription_term !== required.term ||
    school.subscription_year !== required.year;

  if (changed || termChanged || options.manual) {
    await pool.query(
      `UPDATE schools
       SET subscription_status = $1,
           subscription_term = $2,
           subscription_year = $3
       WHERE id = $4`,
      [newStatus, required.term, required.year, schoolId],
    );

    if (changed || options.manual) {
      await logSubscriptionAudit({
        schoolId,
        action,
        previousStatus,
        newStatus,
        previousTerm,
        previousYear,
        requiredTerm: required.term,
        requiredYear: required.year,
        triggeredBy: options.triggeredBy ?? null,
        notes: options.manual ? "Manual payment required" : "Term rollover detected",
      });
    }
  }

  return {
    school_id: schoolId,
    changed: changed || termChanged,
    previous_status: previousStatus,
    new_status: newStatus,
    required_term: required.term,
    required_year: required.year,
    needs_payment: true,
  };
}

export async function auditAllSchoolSubscriptions(triggeredBy?: string) {
  const schools = await pool.query<{ id: string }>(
    `SELECT id FROM schools WHERE status <> 'setup' ORDER BY created_at ASC`,
  );

  const results: SubscriptionAuditResult[] = [];
  let changedCount = 0;

  for (const school of schools.rows) {
    const result = await auditSchoolSubscription(school.id, { triggeredBy });
    if (result) {
      results.push(result);
      if (result.changed) {
        changedCount += 1;
      }
    }
  }

  return {
    scanned: results.length,
    changed: changedCount,
    results,
  };
}

export async function getSubscriptionAuditOverview() {
  const schools = await pool.query<{
    id: string;
    name: string | null;
    slug: string;
    status: string;
    subscription_status: string;
    subscription_term: string | null;
    subscription_year: number | null;
    admin_email: string;
  }>(
    `SELECT
       s.id,
       s.name,
       s.slug,
       s.status,
       s.subscription_status,
       s.subscription_term,
       s.subscription_year,
       COALESCE(u.email, '') AS admin_email
     FROM schools s
     LEFT JOIN LATERAL (
       SELECT email FROM users u
       WHERE u.school_id = s.id AND LOWER(u.role) = 'admin'
       ORDER BY u.created_at ASC
       LIMIT 1
     ) u ON true
     WHERE s.status <> 'setup'
     ORDER BY s.name ASC`,
  );

  const items = [];

  for (const school of schools.rows) {
    const required = await resolveRequiredBillingPeriod(school.id);
    const needsPayment = !isPaidForTerm(
      school.subscription_status,
      school.subscription_term,
      school.subscription_year,
      required.term,
      required.year,
    );

    items.push({
      school_id: school.id,
      name: school.name,
      slug: school.slug,
      status: school.status,
      subscription_status: school.subscription_status,
      paid_term: school.subscription_term,
      paid_year: school.subscription_year,
      required_term: required.term,
      required_year: required.year,
      term_source: required.source,
      term_start: required.term_start,
      needs_payment: needsPayment,
      admin_email: school.admin_email,
    });
  }

  return {
    items,
    summary: {
      total: items.length,
      needs_payment: items.filter((item) => item.needs_payment).length,
      active: items.filter((item) => !item.needs_payment).length,
    },
  };
}

export async function getSchoolAuditHistory(schoolId: string, limit = 20) {
  const result = await pool.query(
    `SELECT
       l.id,
       l.action,
       l.previous_status,
       l.new_status,
       l.previous_term,
       l.previous_year,
       l.required_term,
       l.required_year,
       l.notes,
       l.created_at,
       sa.name AS triggered_by_name,
       sa.email AS triggered_by_email
     FROM subscription_audit_logs l
     LEFT JOIN super_admins sa ON sa.id = l.triggered_by
     WHERE l.school_id = $1
     ORDER BY l.created_at DESC
     LIMIT $2`,
    [schoolId, limit],
  );

  return result.rows;
}
