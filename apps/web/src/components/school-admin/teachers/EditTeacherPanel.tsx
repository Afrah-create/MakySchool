"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { SlideOver } from "@makyschool/ui/components/ui/SlideOver";
import { apiClient } from "@/lib/api/client";
import {
  assignmentReducer,
  assignmentsFromRows,
  diffAssignments,
  rowsFromAssignments,
} from "@/lib/teachers/assignments";
import type { TeacherDetail } from "@/lib/teachers/types";
import { validateTeacherForm } from "@/lib/validation/teachers";
import { useToast } from "@/providers/ToastProvider";
import { AssignmentBuilder } from "./AssignmentBuilder";

export function EditTeacherPanel({
  teacher,
  onClose,
  onSaved,
}: {
  teacher: TeacherDetail | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = Boolean(teacher);
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [assignmentState, dispatchAssignments] = useReducer(assignmentReducer, { rows: [] });
  const [initialRows, setInitialRows] = useState(assignmentState.rows);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmAssignments, setConfirmAssignments] = useState(false);

  useEffect(() => {
    if (!teacher) return;
    const rows = rowsFromAssignments(teacher.assignments);
    setFullName(teacher.full_name);
    setPhone(teacher.phone ?? "");
    setSpecialization(teacher.subject_specialization ?? "");
    dispatchAssignments({ type: "reset", rows });
    setInitialRows(rows);
    setErrors({});
    setBannerError(null);
    setConfirmAssignments(false);
  }, [teacher]);

  const assignmentDiff = useMemo(
    () => diffAssignments(initialRows, assignmentState.rows),
    [initialRows, assignmentState.rows],
  );

  const assignmentsChanged =
    assignmentDiff.added.length > 0 || assignmentDiff.removed.length > 0;

  async function save() {
    if (!teacher) return;
    setLoading(true);
    setBannerError(null);

    try {
      await apiClient<TeacherDetail>(`/schools/teachers/${teacher.id}`, {
        method: "PATCH",
        body: {
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          subject_specialization: specialization.trim() || null,
          assignments: assignmentsFromRows(assignmentState.rows),
        },
      });
      toast.success(`Changes saved for ${fullName.trim()}.`);
      onSaved();
      onClose();
    } catch (error) {
      const err = error as Error & { fields?: Record<string, string> };
      if (err.fields) setErrors(err.fields);
      setBannerError(err.message);
    } finally {
      setLoading(false);
      setConfirmAssignments(false);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const clientErrors = validateTeacherForm({ full_name: fullName, phone });
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;

    if (assignmentsChanged && !confirmAssignments) {
      setConfirmAssignments(true);
      return;
    }

    void save();
  }

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={teacher ? `Edit ${teacher.full_name}` : "Edit teacher"}
      description="Update profile details and class assignments."
      footer={
        <button
          type="submit"
          form="edit-teacher-form"
          disabled={loading}
          className="ms-btn-primary w-full"
        >
          {loading ? "Saving…" : "Save changes"}
        </button>
      }
    >
      {teacher ? (
        <form id="edit-teacher-form" onSubmit={handleSubmit} className="space-y-6">
          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Email</span>
            <p className="text-sm text-theme-primary">{teacher.email}</p>
            <p className="mt-1 text-xs text-theme-faint">Email cannot be changed after account creation.</p>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Full name *</span>
            <input className="ms-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            {errors.full_name ? <p className="mt-1 text-xs text-theme-danger">{errors.full_name}</p> : null}
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Phone number</span>
            <input className="ms-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
            {errors.phone ? <p className="mt-1 text-xs text-theme-danger">{errors.phone}</p> : null}
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Subject specialisation</span>
            <input className="ms-input" value={specialization} onChange={(e) => setSpecialization(e.target.value)} />
          </label>

          <section className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">Class assignments</p>
            <AssignmentBuilder state={assignmentState} dispatch={dispatchAssignments} />
          </section>

          {confirmAssignments ? (
            <div className="rounded-lg border border-theme bg-theme-surface-raised p-4 text-sm">
              <p className="font-medium text-theme-primary">
                You&apos;re about to update {teacher.full_name}&apos;s class assignments:
              </p>
              <ul className="mt-3 space-y-1 text-theme-muted">
                {assignmentDiff.removed.map((row) => (
                  <li key={`r-${row.class_id}`}>Removed: {row.class_name}</li>
                ))}
                {assignmentDiff.added.map((row) => (
                  <li key={`a-${row.class_id}`}>Added: {row.class_name}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-theme-muted">
                This takes effect immediately. The teacher will see their new classes on next login.
              </p>
              <div className="mt-4 flex gap-2">
                <button type="button" className="ms-btn-secondary" onClick={() => setConfirmAssignments(false)}>
                  Cancel
                </button>
                <button type="button" className="ms-btn-primary" onClick={() => void save()}>
                  Confirm changes
                </button>
              </div>
            </div>
          ) : null}

          {bannerError ? (
            <div className="rounded-lg border border-theme bg-theme-danger-bg px-3 py-2 text-sm text-theme-danger">
              {bannerError}
            </div>
          ) : null}
        </form>
      ) : null}
    </SlideOver>
  );
}
