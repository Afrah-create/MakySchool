import type { TeacherAssignment, TeacherAssignmentRow } from "./types";

export type AssignmentState = {
  rows: TeacherAssignmentRow[];
};

export type AssignmentAction =
  | { type: "reset"; rows: TeacherAssignmentRow[] }
  | { type: "add_class"; class_id: string; class_name: string }
  | { type: "remove_class"; class_id: string }
  | {
      type: "toggle_subject";
      class_id: string;
      subject_id: string;
      subject_name?: string;
    };

export function formatAssignmentLabel(item: TeacherAssignment) {
  if (item.subject_name) {
    return `${item.class_name ?? "Class"} — ${item.subject_name}`;
  }
  return item.class_name ?? "Class";
}

export function assignmentsFromRows(rows: TeacherAssignmentRow[]): TeacherAssignment[] {
  const output: TeacherAssignment[] = [];
  for (const row of rows) {
    if (row.subject_ids.length === 0) {
      output.push({ class_id: row.class_id, class_name: row.class_name });
      continue;
    }
    for (const subject_id of row.subject_ids) {
      output.push({
        class_id: row.class_id,
        class_name: row.class_name,
        subject_id,
        subject_name: row.subject_names[subject_id],
      });
    }
  }
  return output;
}

export function normalizeTeacherAssignments(
  raw: TeacherAssignment[] | string | undefined,
): TeacherAssignment[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (item): item is TeacherAssignment => typeof item === "object" && item !== null,
      );
    } catch {
      return [];
    }
  }
  return Array.isArray(raw) ? raw : [];
}

export function rowsFromAssignments(assignments: TeacherAssignment[]): TeacherAssignmentRow[] {
  const normalized = normalizeTeacherAssignments(assignments);
  const map = new Map<string, TeacherAssignmentRow>();
  for (const item of normalized) {
    const existing = map.get(item.class_id) ?? {
      class_id: item.class_id,
      class_name: item.class_name ?? item.class_id,
      subject_ids: [],
      subject_names: {},
    };
    if (item.subject_id && !existing.subject_ids.includes(item.subject_id)) {
      existing.subject_ids.push(item.subject_id);
      if (item.subject_name) {
        existing.subject_names[item.subject_id] = item.subject_name;
      }
    }
    map.set(item.class_id, existing);
  }
  return [...map.values()];
}

export function assignmentReducer(state: AssignmentState, action: AssignmentAction): AssignmentState {
  switch (action.type) {
    case "reset":
      return { rows: action.rows };
    case "add_class":
      if (state.rows.some((row) => row.class_id === action.class_id)) {
        return state;
      }
      return {
        rows: [
          ...state.rows,
          {
            class_id: action.class_id,
            class_name: action.class_name,
            subject_ids: [],
            subject_names: {},
          },
        ],
      };
    case "remove_class":
      return { rows: state.rows.filter((row) => row.class_id !== action.class_id) };
    case "toggle_subject":
      return {
        rows: state.rows.map((row) => {
          if (row.class_id !== action.class_id) return row;
          const has = row.subject_ids.includes(action.subject_id);
          const subject_names = { ...row.subject_names };
          if (!has && action.subject_name) {
            subject_names[action.subject_id] = action.subject_name;
          }
          if (has) {
            delete subject_names[action.subject_id];
          }
          return {
            ...row,
            subject_ids: has
              ? row.subject_ids.filter((id) => id !== action.subject_id)
              : [...row.subject_ids, action.subject_id],
            subject_names,
          };
        }),
      };
    default:
      return state;
  }
}

export function diffAssignmentPairs(
  before: TeacherAssignment[],
  after: TeacherAssignment[],
) {
  const key = (item: Pick<TeacherAssignment, "class_id" | "subject_id">) =>
    `${item.class_id}:${item.subject_id ?? ""}`;

  const beforeKeys = new Set(before.map(key));
  const afterKeys = new Set(after.map(key));

  const removed = before.filter((item) => !afterKeys.has(key(item)));
  const added = after.filter((item) => !beforeKeys.has(key(item)));

  return { removed, added };
}

/** @deprecated Use diffAssignmentPairs for subject-level diffs */
export function diffAssignments(before: TeacherAssignmentRow[], after: TeacherAssignmentRow[]) {
  return diffAssignmentPairs(assignmentsFromRows(before), assignmentsFromRows(after));
}

export type AssignmentDetachWarning = {
  class_id: string;
  class_name: string;
  status: string;
  message: string;
};

export type AssignmentDetachBlock = {
  class_id: string;
  class_name: string;
  status: string;
  reason: string;
};

export type AssignmentSyncPreview = {
  warnings: AssignmentDetachWarning[];
  blocks: AssignmentDetachBlock[];
};
