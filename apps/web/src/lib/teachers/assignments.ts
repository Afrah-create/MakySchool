import type { TeacherAssignment, TeacherAssignmentRow } from "./types";

export type AssignmentState = {
  rows: TeacherAssignmentRow[];
};

export type AssignmentAction =
  | { type: "reset"; rows: TeacherAssignmentRow[] }
  | { type: "add_class"; class_id: string; class_name: string }
  | { type: "remove_class"; class_id: string }
  | { type: "toggle_subject"; class_id: string; subject_id: string };

export function assignmentsFromRows(rows: TeacherAssignmentRow[]): TeacherAssignment[] {
  const output: TeacherAssignment[] = [];
  for (const row of rows) {
    if (row.subject_ids.length === 0) {
      output.push({ class_id: row.class_id, class_name: row.class_name });
      continue;
    }
    for (const subject_id of row.subject_ids) {
      output.push({ class_id: row.class_id, class_name: row.class_name, subject_id });
    }
  }
  return output;
}

export function rowsFromAssignments(assignments: TeacherAssignment[]): TeacherAssignmentRow[] {
  const map = new Map<string, TeacherAssignmentRow>();
  for (const item of assignments) {
    const existing = map.get(item.class_id) ?? {
      class_id: item.class_id,
      class_name: item.class_name ?? item.class_id,
      subject_ids: [],
    };
    if (item.subject_id && !existing.subject_ids.includes(item.subject_id)) {
      existing.subject_ids.push(item.subject_id);
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
          { class_id: action.class_id, class_name: action.class_name, subject_ids: [] },
        ],
      };
    case "remove_class":
      return { rows: state.rows.filter((row) => row.class_id !== action.class_id) };
    case "toggle_subject":
      return {
        rows: state.rows.map((row) => {
          if (row.class_id !== action.class_id) return row;
          const has = row.subject_ids.includes(action.subject_id);
          return {
            ...row,
            subject_ids: has
              ? row.subject_ids.filter((id) => id !== action.subject_id)
              : [...row.subject_ids, action.subject_id],
          };
        }),
      };
    default:
      return state;
  }
}

export function diffAssignments(
  before: TeacherAssignmentRow[],
  after: TeacherAssignmentRow[],
) {
  const key = (row: TeacherAssignmentRow) =>
    `${row.class_id}:${[...row.subject_ids].sort().join(",")}`;

  const beforeKeys = new Set(before.map(key));
  const afterKeys = new Set(after.map(key));

  const removed = before.filter((row) => !afterKeys.has(key(row)));
  const added = after.filter((row) => !beforeKeys.has(key(row)));

  return { removed, added };
}
