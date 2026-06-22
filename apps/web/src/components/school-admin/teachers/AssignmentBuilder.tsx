"use client";

import { useReducer, useState } from "react";
import { X } from "lucide-react";
import { formatClassLabel } from "@makyschool/shared/constants";
import { useApiSWR } from "@/hooks/useApiSWR";
import {
  assignmentReducer,
  type AssignmentAction,
  type AssignmentState,
} from "@/lib/teachers/assignments";
import type { ClassOption, SubjectOption } from "@/lib/teachers/types";

function ClassSubjects({
  classId,
  selected,
  onToggle,
}: {
  classId: string;
  selected: string[];
  onToggle: (subjectId: string, subjectName: string) => void;
}) {
  const { data } = useApiSWR<SubjectOption[]>(`/schools/classes/${classId}/subjects`);

  if (!data?.length) {
    return <p className="mt-2 text-xs text-theme-muted">No subjects linked to this class.</p>;
  }

  return (
    <div className="mt-3 space-y-2 pl-1">
      {data.map((subject) => (
        <label key={subject.id} className="flex items-center gap-2 text-sm text-theme-muted">
          <input
            type="checkbox"
            checked={selected.includes(subject.id)}
            onChange={() => onToggle(subject.id, subject.name)}
          />
          {subject.name}
        </label>
      ))}
    </div>
  );
}

export function AssignmentBuilder({
  state,
  dispatch,
}: {
  state: AssignmentState;
  dispatch: React.Dispatch<AssignmentAction>;
}) {
  const { data: classes } = useApiSWR<ClassOption[]>("/schools/classes");
  const [selectedClassId, setSelectedClassId] = useState("");

  const available = (classes ?? []).filter(
    (item) => !state.rows.some((row) => row.class_id === item.id),
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <select
          value={selectedClassId}
          onChange={(event) => setSelectedClassId(event.target.value)}
          className="ms-input flex-1"
        >
          <option value="">Select a class</option>
          {available.map((item) => (
            <option key={item.id} value={item.id}>
              {formatClassLabel(item.level, item.stream)}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!selectedClassId}
          className="ms-btn-secondary shrink-0"
          onClick={() => {
            const picked = classes?.find((item) => item.id === selectedClassId);
            if (!picked) return;
            dispatch({
              type: "add_class",
              class_id: picked.id,
              class_name: formatClassLabel(picked.level, picked.stream),
            });
            setSelectedClassId("");
          }}
        >
          Add class
        </button>
      </div>

      {state.rows.map((row) => (
        <div key={row.class_id} className="rounded-lg border border-theme p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex rounded-full bg-theme-accent-muted px-2.5 py-0.5 text-xs font-medium text-theme-accent">
              {row.class_name}
            </span>
            <button
              type="button"
              aria-label={`Remove ${row.class_name}`}
              onClick={() => dispatch({ type: "remove_class", class_id: row.class_id })}
              className="text-theme-muted hover:text-theme-danger"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ClassSubjects
            classId={row.class_id}
            selected={row.subject_ids}
            onToggle={(subjectId, subjectName) =>
              dispatch({
                type: "toggle_subject",
                class_id: row.class_id,
                subject_id: subjectId,
                subject_name: subjectName,
              })
            }
          />
        </div>
      ))}
    </div>
  );
}
