"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { SlideOver } from "@makyschool/ui/components/ui/SlideOver";
import { apiClient } from "@/lib/api/client";
import {
  assignmentReducer,
  assignmentsFromRows,
  diffAssignmentPairs,
  formatAssignmentLabel,
  rowsFromAssignments,
  type AssignmentSyncPreview,
} from "@/lib/teachers/assignments";
import type { TeacherAssignment, TeacherDetail } from "@/lib/teachers/types";
import { validateTeacherForm } from "@/lib/validation/teachers";
import { useToast } from "@/providers/ToastProvider";
import { AssignmentBuilder } from "./AssignmentBuilder";
import { SubjectSpecializationSelect } from "./SubjectSpecializationSelect";

export function EditTeacherPanel({
  teacher,
  assignmentsOnly = false,
  onClose,
  onSaved,
}: {
  teacher: TeacherDetail | null;
  assignmentsOnly?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = Boolean(teacher);
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [assignmentState, dispatchAssignments] = useReducer(assignmentReducer, { rows: [] });
  const [initialAssignments, setInitialAssignments] = useState<TeacherAssignment[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmAssignments, setConfirmAssignments] = useState(false);
  const [serverPreview, setServerPreview] = useState<AssignmentSyncPreview | null>(null);

  useEffect(() => {
    if (!teacher) return;
    const rows = rowsFromAssignments(teacher.assignments);
    setFullName(teacher.full_name);
    setPhone(teacher.phone ?? "");
    setSpecialization(teacher.subject_specialization ?? "");
    dispatchAssignments({ type: "reset", rows });
    setInitialAssignments(teacher.assignments);
    setErrors({});
    setBannerError(null);
    setConfirmAssignments(false);
    setServerPreview(null);
  }, [teacher]);

  const currentAssignments = useMemo(
    () => assignmentsFromRows(assignmentState.rows),
    [assignmentState.rows],
  );

  const assignmentDiff = useMemo(
    () => diffAssignmentPairs(initialAssignments, currentAssignments),
    [initialAssignments, currentAssignments],
  );

  const assignmentsChanged =
    assignmentDiff.added.length > 0 || assignmentDiff.removed.length > 0;

  async function save(acknowledgeWarnings = false) {
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
          assignments: currentAssignments.map(({ class_id, subject_id }) => ({
            class_id,
            subject_id: subject_id ?? null,
          })),
          acknowledge_assignment_warnings: acknowledgeWarnings,
        },
      });
      toast.success(
        assignmentsOnly
          ? `Assignments updated for ${teacher.full_name}.`
          : `Changes saved for ${fullName.trim()}.`,
      );
      onSaved();
      onClose();
    } catch (error) {
      const err = error as Error & {
        code?: string;
        fields?: Record<string, string>;
        preview?: AssignmentSyncPreview;
      };

      if (err.code === "ASSIGNMENT_CONFIRM_REQUIRED") {
        setServerPreview(err.preview ?? null);
        setConfirmAssignments(true);
        setBannerError(null);
        return;
      }

      if (err.code === "ASSIGNMENT_LOCKED") {
        setConfirmAssignments(false);
        setServerPreview(err.preview ?? null);
        setBannerError(
          err.fields?.assignments ??
            "Submitted marks prevent removing this teacher from one or more classes.",
        );
        if (err.fields) setErrors(err.fields);
        return;
      }

      if (err.fields) setErrors(err.fields);
      setBannerError(err.message);
      setConfirmAssignments(false);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!assignmentsOnly) {
      const clientErrors = validateTeacherForm({ full_name: fullName, phone });
      setErrors(clientErrors);
      if (Object.keys(clientErrors).length > 0) return;
    }

    if (assignmentsChanged && !confirmAssignments) {
      setConfirmAssignments(true);
      return;
    }

    void save(confirmAssignments);
  }

  const warnings = serverPreview?.warnings ?? [];
  const blocks = serverPreview?.blocks ?? [];

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={
        teacher
          ? assignmentsOnly
            ? `Edit assignments — ${teacher.full_name}`
            : `Edit ${teacher.full_name}`
          : "Edit teacher"
      }
      description={
        assignmentsOnly
          ? "Add or remove classes and subjects. Submitted marks may block some removals."
          : "Update profile details and class assignments."
      }
      footer={
        <button
          type="submit"
          form="edit-teacher-form"
          disabled={loading || blocks.length > 0}
          className="ms-btn-primary w-full"
        >
          {loading ? "Saving…" : assignmentsOnly ? "Save assignments" : "Save changes"}
        </button>
      }
    >
      {teacher ? (
        <form id="edit-teacher-form" onSubmit={handleSubmit} className="space-y-6">
          {!assignmentsOnly ? (
            <>
              <label className="block">
                <span className="mb-1 block text-xs text-theme-muted">Email</span>
                <p className="text-sm text-theme-primary">{teacher.email}</p>
                <p className="mt-1 text-xs text-theme-faint">
                  Email cannot be changed after account creation.
                </p>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-theme-muted">Full name *</span>
                <input
                  className="ms-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
                {errors.full_name ? (
                  <p className="mt-1 text-xs text-theme-danger">{errors.full_name}</p>
                ) : null}
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-theme-muted">Phone number</span>
                <input className="ms-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
                {errors.phone ? <p className="mt-1 text-xs text-theme-danger">{errors.phone}</p> : null}
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-theme-muted">Subject specialisation</span>
                <SubjectSpecializationSelect value={specialization} onChange={setSpecialization} />
              </label>
            </>
          ) : null}

          <section className="space-y-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">
                Class assignments
              </p>
              <p className="mt-1 text-xs text-theme-muted">
                Removing a class revokes portal access for that class. Submitted marks for the
                current term block full class removal. Subject-only changes are allowed when the
                teacher remains on the class.
              </p>
            </div>
            <AssignmentBuilder state={assignmentState} dispatch={dispatchAssignments} />
            {errors.assignments ? (
              <p className="text-xs text-theme-danger">{errors.assignments}</p>
            ) : null}
          </section>

          {confirmAssignments ? (
            <div className="rounded-lg border border-theme bg-theme-surface-raised p-4 text-sm">
              <p className="font-medium text-theme-primary">
                Confirm assignment changes for {teacher.full_name}
              </p>

              {assignmentDiff.removed.length > 0 ? (
                <div className="mt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">
                    Being removed
                  </p>
                  <ul className="mt-2 space-y-1 text-theme-muted">
                    {assignmentDiff.removed.map((item) => (
                      <li key={`r-${item.class_id}-${item.subject_id ?? "all"}`}>
                        {formatAssignmentLabel(item)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {assignmentDiff.added.length > 0 ? (
                <div className="mt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">
                    Being added
                  </p>
                  <ul className="mt-2 space-y-1 text-theme-muted">
                    {assignmentDiff.added.map((item) => (
                      <li key={`a-${item.class_id}-${item.subject_id ?? "all"}`}>
                        {formatAssignmentLabel(item)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {warnings.length > 0 ? (
                <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                  <div className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div className="space-y-1 text-xs text-amber-900 dark:text-amber-100">
                      {warnings.map((warning) => (
                        <p key={warning.class_id}>{warning.message}</p>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {blocks.length > 0 ? (
                <div className="mt-4 rounded-lg border border-theme-danger/30 bg-theme-danger-bg p-3 text-xs text-theme-danger">
                  {blocks.map((block) => (
                    <p key={block.class_id}>{block.reason}</p>
                  ))}
                </div>
              ) : null}

              <p className="mt-3 text-xs text-theme-muted">
                Historical marks records are kept for audit purposes. The teacher loses access
                immediately after you confirm.
              </p>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  className="ms-btn-secondary"
                  onClick={() => {
                    setConfirmAssignments(false);
                    setServerPreview(null);
                  }}
                >
                  Go back
                </button>
                <button
                  type="button"
                  className="ms-btn-primary"
                  disabled={blocks.length > 0 || loading}
                  onClick={() => void save(true)}
                >
                  {loading ? "Saving…" : "Confirm and apply"}
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
