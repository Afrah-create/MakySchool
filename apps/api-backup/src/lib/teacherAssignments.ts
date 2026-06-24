import { pool } from "../db/pool.js";

export type AssignmentInput = {
  class_id: string;
  subject_id?: string | null;
};

type ExistingAssignment = {
  id: string;
  class_id: string;
  subject_id: string | null;
};

type RemovalBlock = {
  class_id: string;
  class_name: string;
  status: string;
  reason: string;
};

type RemovalWarning = {
  class_id: string;
  class_name: string;
  status: string;
  message: string;
};

export type AssignmentSyncPreview = {
  to_add: AssignmentInput[];
  to_remove: ExistingAssignment[];
  warnings: RemovalWarning[];
  blocks: RemovalBlock[];
};

function assignmentKey(classId: string, subjectId: string | null | undefined) {
  return `${classId}:${subjectId ?? ""}`;
}

export async function getCurrentTermId(schoolId: string): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM terms
     WHERE school_id = $1 AND is_current = true
     ORDER BY id ASC
     LIMIT 1`,
    [schoolId],
  );
  return result.rows[0]?.id ?? null;
}

async function fetchExistingAssignments(schoolId: string, teacherId: string) {
  const result = await pool.query<ExistingAssignment>(
    `SELECT id, class_id, subject_id
     FROM teacher_class_assignments
     WHERE school_id = $1 AND teacher_id = $2`,
    [schoolId, teacherId],
  );
  return result.rows;
}

function formatClassName(level: string, stream: string | null) {
  return stream ? `${level}${stream}` : level;
}

async function classNamesForIds(schoolId: string, classIds: string[]) {
  if (classIds.length === 0) {
    return new Map<string, string>();
  }

  const result = await pool.query<{ id: string; level: string; stream: string | null }>(
    `SELECT id, level, stream
     FROM school_classes
     WHERE school_id = $1 AND id = ANY($2::uuid[])`,
    [schoolId, classIds],
  );

  return new Map(
    result.rows.map((row) => [row.id, formatClassName(row.level, row.stream)]),
  );
}

/**
 * A class is fully detached when no assignment rows remain for it after the sync.
 */
function fullyVacatedClassIds(toRemove: ExistingAssignment[], desired: AssignmentInput[]) {
  const vacated = new Set<string>();
  const touched = new Set(toRemove.map((row) => row.class_id));

  for (const classId of touched) {
    const stillDesired = desired.some((item) => item.class_id === classId);
    if (!stillDesired) {
      vacated.add(classId);
    }
  }

  return vacated;
}

async function inspectClassDetachImpact(
  schoolId: string,
  teacherId: string,
  classIds: Set<string>,
  termId: string | null,
) {
  if (classIds.size === 0) {
    return { blocks: [] as RemovalBlock[], warnings: [] as RemovalWarning[] };
  }

  const names = await classNamesForIds(schoolId, [...classIds]);
  const submissionResult = await pool.query<{
    class_id: string;
    status: string;
  }>(
    `SELECT class_id, status
     FROM teacher_term_submissions
     WHERE school_id = $1
       AND teacher_id = $2
       AND class_id = ANY($3::uuid[])
       AND ($4::uuid IS NULL OR term_id = $4)`,
    [schoolId, teacherId, [...classIds], termId],
  );

  const blocks: RemovalBlock[] = [];
  const warnings: RemovalWarning[] = [];

  for (const classId of classIds) {
    const className = names.get(classId) ?? "Class";
    const submission = submissionResult.rows.find((row) => row.class_id === classId);

    if (!submission) {
      continue;
    }

    if (submission.status === "submitted") {
      blocks.push({
        class_id: classId,
        class_name: className,
        status: submission.status,
        reason: `Marks for ${className} have already been submitted for the current term. Reassign or archive marks before removing this teacher from the class.`,
      });
      continue;
    }

    if (submission.status === "draft") {
      warnings.push({
        class_id: classId,
        class_name: className,
        status: submission.status,
        message: `${className} has draft marks in progress. Detaching will revoke the teacher's access but draft work will remain on record.`,
      });
      continue;
    }

    warnings.push({
      class_id: classId,
      class_name: className,
      status: submission.status,
      message: `${className} has a pending marks submission for the current term. The teacher will lose access immediately.`,
    });
  }

  return { blocks, warnings };
}

export function planAssignmentSync(
  existing: ExistingAssignment[],
  desired: AssignmentInput[],
): { to_add: AssignmentInput[]; to_remove: ExistingAssignment[] } {
  const desiredKeys = new Set(
    desired.map((item) => assignmentKey(item.class_id, item.subject_id)),
  );
  const existingKeys = new Set(
    existing.map((item) => assignmentKey(item.class_id, item.subject_id)),
  );

  const to_remove = existing.filter(
    (item) => !desiredKeys.has(assignmentKey(item.class_id, item.subject_id)),
  );

  const to_add = desired.filter(
    (item) => !existingKeys.has(assignmentKey(item.class_id, item.subject_id)),
  );

  return { to_add, to_remove };
}

export async function previewAssignmentSync(
  schoolId: string,
  teacherId: string,
  desired: AssignmentInput[],
): Promise<AssignmentSyncPreview> {
  const existing = await fetchExistingAssignments(schoolId, teacherId);
  const { to_add, to_remove } = planAssignmentSync(existing, desired);
  const termId = await getCurrentTermId(schoolId);
  const vacatedClassIds = fullyVacatedClassIds(to_remove, desired);
  const { blocks, warnings } = await inspectClassDetachImpact(
    schoolId,
    teacherId,
    vacatedClassIds,
    termId,
  );

  return { to_add, to_remove, warnings, blocks };
}

export async function syncTeacherAssignments(
  schoolId: string,
  teacherId: string,
  assignedBy: string,
  desired: AssignmentInput[],
  options: { acknowledge_warnings?: boolean } = {},
) {
  const preview = await previewAssignmentSync(schoolId, teacherId, desired);

  if (preview.blocks.length > 0) {
    const fields: Record<string, string> = {
      assignments: preview.blocks.map((item) => item.reason).join(" "),
    };
    return {
      ok: false as const,
      code: "ASSIGNMENT_LOCKED" as const,
      error:
        "One or more classes cannot be removed because marks have already been submitted for the current term.",
      fields,
      preview,
    };
  }

  if (preview.warnings.length > 0 && !options.acknowledge_warnings) {
    return {
      ok: false as const,
      code: "ASSIGNMENT_CONFIRM_REQUIRED" as const,
      error: "Confirm assignment changes to detach this teacher from in-progress work.",
      preview,
    };
  }

  for (const row of preview.to_remove) {
    await pool.query("DELETE FROM teacher_class_assignments WHERE id = $1", [row.id]);
  }

  for (const item of preview.to_add) {
    await pool.query(
      `INSERT INTO teacher_class_assignments
         (id, school_id, teacher_id, class_id, subject_id, assigned_by, assigned_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
       ON CONFLICT (school_id, teacher_id, class_id, subject_id) DO NOTHING`,
      [schoolId, teacherId, item.class_id, item.subject_id ?? null, assignedBy],
    );
  }

  return { ok: true as const, preview };
}

export async function scaffoldTermSubmissions(
  schoolId: string,
  teacherId: string,
  assignments: AssignmentInput[],
) {
  const termId = await getCurrentTermId(schoolId);
  if (!termId) {
    return;
  }

  const classIds = [...new Set(assignments.map((item) => item.class_id))];
  for (const classId of classIds) {
    await pool.query(
      `INSERT INTO teacher_term_submissions (school_id, teacher_id, class_id, term_id, status)
       VALUES ($1, $2, $3, $4, 'pending')
       ON CONFLICT (school_id, teacher_id, class_id, term_id) DO NOTHING`,
      [schoolId, teacherId, classId, termId],
    );
  }
}
