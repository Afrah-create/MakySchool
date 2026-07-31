"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ClipboardList,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { Modal } from "@makyschool/ui/components/ui/Modal";
import { ConfirmDialog } from "@makyschool/ui/components/ui/ConfirmDialog";
import {
  isUpperPrimaryLevel,
  schoolOffersPrimary,
  type PrimaryExam,
  type PrimaryExamStatus,
} from "@makyschool/shared";
import { useSchool } from "@/providers/SchoolProvider";
import { useToast } from "@/providers/ToastProvider";
import { useCan } from "@/hooks/useCurrentRole";
import { useCurrentTerm } from "@/hooks/useCurrentTerm";
import {
  useClosePrimaryExam,
  useCreatePrimaryExam,
  useHardDeletePrimaryExam,
  useOpenPrimaryExam,
  usePrimaryClasses,
  usePrimaryExamTypes,
  usePrimaryExams,
  usePrimarySubjects,
  useRestorePrimaryExam,
  useSoftDeletePrimaryExam,
  useUpdatePrimaryExam,
} from "@/hooks/usePrimary";

const STATUS_LABEL: Record<PrimaryExamStatus, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
};

export function PrimaryExamsContent() {
  const { school } = useSchool();
  const offers = schoolOffersPrimary(school?.school_type);
  const { toast } = useToast();
  const canManage = useCan("managePrimarySetup");
  const canView = useCan("viewPrimaryResults");

  const { data: term } = useCurrentTerm();
  const { data: classes = [] } = usePrimaryClasses(offers);
  const upper = useMemo(
    () => classes.filter((c) => isUpperPrimaryLevel(c.level)),
    [classes],
  );

  const [classId, setClassId] = useState("");
  const [statusFilter, setStatusFilter] = useState<PrimaryExamStatus | "">("");
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const { data: examTypes = [] } = usePrimaryExamTypes(offers, true);
  const {
    data: exams = [],
    isPending,
    isError,
    refetch,
  } = usePrimaryExams(
    {
      classId: classId || undefined,
      termId: term?.id,
      status: statusFilter || undefined,
      includeDeleted: canManage && includeDeleted,
    },
    offers && !!term?.id,
  );

  const createExam = useCreatePrimaryExam();
  const updateExam = useUpdatePrimaryExam();
  const softDelete = useSoftDeletePrimaryExam();
  const hardDelete = useHardDeletePrimaryExam();
  const restoreExam = useRestorePrimaryExam();
  const openExam = useOpenPrimaryExam();
  const closeExam = useClosePrimaryExam();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PrimaryExam | null>(null);
  const [toDelete, setToDelete] = useState<PrimaryExam | null>(null);
  const [deleteMode, setDeleteMode] = useState<"soft" | "hard">("soft");

  const [fClassId, setFClassId] = useState("");
  const [fTypeId, setFTypeId] = useState("");
  const [fName, setFName] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [fOpenNow, setFOpenNow] = useState(true);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);

  const formClass = upper.find((c) => c.id === (editing ? editing.classId : fClassId));
  const { data: subjects = [] } = usePrimarySubjects(
    formClass?.level,
    offers && formOpen && !!formClass,
  );
  const examableSubjects = useMemo(
    () => subjects.filter((s) => s.subjectType === "core" || s.subjectType === "elective"),
    [subjects],
  );
  const subjectCatalogKey = useMemo(
    () => examableSubjects.map((s) => `${s.id}:${s.isPleSubject ? 1 : 0}`).join("|"),
    [examableSubjects],
  );

  useEffect(() => {
    if (!formOpen || editing) return;
    const ple = examableSubjects.filter((s) => s.isPleSubject).map((s) => s.id);
    setSelectedSubjects(ple.length ? ple : examableSubjects.map((s) => s.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formOpen, fClassId, subjectCatalogKey, editing]);

  if (!offers) {
    return (
      <DashboardPage embedded maxWidth="7xl" title="Primary exams">
        <EmptyState
          title="Primary not enabled"
          description="Not available for secondary-only schools."
        />
      </DashboardPage>
    );
  }

  function toggleSubject(id: string) {
    setSelectedSubjects((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function openCreate() {
    setEditing(null);
    setFClassId(classId || upper[0]?.id || "");
    setFTypeId(examTypes[0]?.id ?? "");
    setFName("");
    setFNotes("");
    setFOpenNow(true);
    setFormOpen(true);
  }

  function openEdit(exam: PrimaryExam) {
    setEditing(exam);
    setFName(exam.name);
    setFNotes(exam.notes ?? "");
    setSelectedSubjects(exam.subjectIds ?? []);
    setFormOpen(true);
  }

  async function submitForm() {
    try {
      if (editing) {
        const payload: {
          name?: string;
          notes?: string | null;
          subjectIds?: string[];
        } = {
          name: fName.trim(),
          notes: fNotes.trim() || null,
        };
        if (!editing.hasMarks && editing.status !== "open") {
          payload.subjectIds = selectedSubjects;
        }
        await updateExam.mutateAsync({ id: editing.id, payload });
        toast.success("Exam updated.");
      } else {
        if (!fClassId || !term?.id || !fTypeId) {
          toast.error("Select class, term, and exam type.");
          return;
        }
        if (!selectedSubjects.length) {
          toast.error("Select at least one subject for this exam.");
          return;
        }
        const created = await createExam.mutateAsync({
          classId: fClassId,
          termId: term.id,
          examTypeId: fTypeId,
          name: fName.trim() || null,
          notes: fNotes.trim() || null,
          openNow: fOpenNow,
          subjectIds: selectedSubjects,
        });
        toast.success(
          created.status === "open"
            ? `${created.name} created and opened for marking.`
            : `${created.name} created as draft.`,
        );
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save exam.");
    }
  }

  async function toggleStatus(exam: PrimaryExam) {
    try {
      if (exam.status === "open") {
        await closeExam.mutateAsync(exam.id);
        toast.success(`${exam.name} closed.`);
      } else {
        await openExam.mutateAsync(exam.id);
        toast.success(`${exam.name} opened for marking.`);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update exam status.",
      );
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      if (deleteMode === "hard") {
        await hardDelete.mutateAsync(toDelete.id);
        toast.success(`${toDelete.name} permanently deleted.`);
      } else {
        await softDelete.mutateAsync(toDelete.id);
        toast.success(`${toDelete.name} moved to deleted.`);
      }
      setToDelete(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete exam.");
      setToDelete(null);
    }
  }

  async function onRestore(exam: PrimaryExam) {
    try {
      await restoreExam.mutateAsync(exam.id);
      toast.success(`${exam.name} restored.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not restore exam.");
    }
  }

  const formBusy = createExam.isPending || updateExam.isPending;
  const canEditSubjects =
    !!editing && !editing.hasMarks && editing.status !== "open" && !editing.deleted;
  const showSubjectPicker = !editing || canEditSubjects;

  return (
    <DashboardPage
      embedded
      maxWidth="7xl"
      eyebrow="Primary"
      title="Exams"
      description="Create exams per P4–P7 class and term. Open for marking, close when teachers finish. Soft-delete keeps marks; permanent delete only for empty exams."
      actions={
        canManage ? (
          <button type="button" className="ms-btn-primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Create exam
          </button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-xl border border-theme bg-theme-raised/40 p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
              Class
            </span>
            <select
              className="ms-input"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
            >
              <option value="">All classes</option>
              {upper.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
              Status
            </span>
            <select
              className="ms-input"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as PrimaryExamStatus | "")
              }
            >
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </label>
          {canManage ? (
            <label className="flex items-center gap-2 pb-2 text-sm text-theme-muted">
              <input
                type="checkbox"
                checked={includeDeleted}
                onChange={(e) => setIncludeDeleted(e.target.checked)}
              />
              Show deleted
            </label>
          ) : null}
          {term?.name ? (
            <p className="pb-2 text-sm text-theme-muted sm:ml-auto">
              Term: <span className="font-medium text-theme-primary">{term.name}</span>
            </p>
          ) : null}
        </div>

        {!term?.id ? (
          <EmptyState
            title="No current term"
            description="Set a current term in academic settings."
          />
        ) : isPending ? (
          <Skeleton className="h-56 w-full rounded-xl" />
        ) : isError ? (
          <EmptyState
            variant="error"
            title="Couldn’t load exams"
            description="Check your connection and try again."
            onRetry={() => void refetch()}
          />
        ) : exams.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No exams yet"
            description="Create an exam for a class and term so teachers can enter marks."
            action={
              canManage ? (
                <button type="button" className="ms-btn-primary" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Create exam
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
            <div className="overflow-x-auto">
              <table className="ms-table w-full min-w-[48rem]">
                <thead className="bg-table-header text-xs font-medium uppercase tracking-wide text-theme-muted">
                  <tr>
                    <th className="px-4 py-3 text-left">Exam</th>
                    <th className="px-4 py-3 text-left">Class</th>
                    <th className="px-4 py-3 text-left">Term</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {exams.map((exam) => {
                    const deleted = !!exam.deleted;
                    const canOpen =
                      !deleted &&
                      ((exam.status === "draft" && canView) ||
                        (exam.status === "closed" && canManage));
                    const canClose = !deleted && exam.status === "open" && canView;
                    return (
                      <tr
                        key={exam.id}
                        className={`border-t border-theme hover:bg-theme-raised/40 ${
                          deleted ? "opacity-70" : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-theme-primary">{exam.name}</p>
                          <p className="text-[11px] text-theme-muted">
                            {exam.examTypeName}
                            {exam.examTypeCode ? ` · ${exam.examTypeCode}` : ""}
                            {exam.hasMarks ? " · has marks" : ""}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-sm text-theme-muted">
                          {exam.className}
                        </td>
                        <td className="px-4 py-3 text-sm text-theme-muted">
                          {exam.termName}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {deleted ? (
                            <span className="rounded-full bg-theme-raised px-2 py-0.5 text-[11px] font-medium text-theme-muted">
                              Deleted
                            </span>
                          ) : (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                exam.status === "open"
                                  ? "bg-theme-success-bg text-theme-success"
                                  : exam.status === "closed"
                                    ? "bg-theme-danger-bg text-theme-danger"
                                    : "bg-theme-raised text-theme-muted"
                              }`}
                            >
                              {STATUS_LABEL[exam.status]}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-1">
                            {!deleted ? (
                              <Link
                                href={`/dashboard/primary/grades?examId=${exam.id}`}
                                className="ms-btn-ghost px-2 py-1 text-xs"
                              >
                                Grades
                              </Link>
                            ) : null}
                            {canClose || canOpen ? (
                              <button
                                type="button"
                                className="ms-btn-ghost px-2 py-1"
                                onClick={() => void toggleStatus(exam)}
                                title={
                                  exam.status === "open" ? "Close exam" : "Open exam"
                                }
                              >
                                {exam.status === "open" ? (
                                  <Lock className="h-4 w-4" />
                                ) : (
                                  <LockOpen className="h-4 w-4" />
                                )}
                              </button>
                            ) : null}
                            {canManage && deleted ? (
                              <>
                                <button
                                  type="button"
                                  className="ms-btn-ghost px-2 py-1"
                                  title="Restore"
                                  onClick={() => void onRestore(exam)}
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </button>
                                {!exam.hasMarks ? (
                                  <button
                                    type="button"
                                    className="ms-btn-ghost px-2 py-1 text-theme-danger"
                                    title="Delete permanently"
                                    onClick={() => {
                                      setDeleteMode("hard");
                                      setToDelete(exam);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                ) : null}
                              </>
                            ) : null}
                            {canManage && !deleted ? (
                              <>
                                <button
                                  type="button"
                                  className="ms-btn-ghost px-2 py-1"
                                  onClick={() => openEdit(exam)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  className="ms-btn-ghost px-2 py-1 text-theme-danger"
                                  title="Soft delete"
                                  onClick={() => {
                                    setDeleteMode("soft");
                                    setToDelete(exam);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                                {!exam.hasMarks && exam.status !== "open" ? (
                                  <button
                                    type="button"
                                    className="ms-btn-ghost px-2 py-1 text-[11px] text-theme-danger"
                                    onClick={() => {
                                      setDeleteMode("hard");
                                      setToDelete(exam);
                                    }}
                                  >
                                    Purge
                                  </button>
                                ) : null}
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Edit exam" : "Create exam"}
        description={
          editing
            ? "Update the display name or notes. Class, term, and type stay fixed."
            : "Each class can have several exams in one term (e.g. Mid Term and End of Term)."
        }
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="ms-btn-ghost"
              onClick={() => setFormOpen(false)}
            >
              Cancel
            </button>
            <LoadingButton
              variant="primary"
              loading={formBusy}
              onClick={() => void submitForm()}
            >
              {editing ? "Save" : "Create"}
            </LoadingButton>
          </div>
        }
      >
        <div className="space-y-4">
          {!editing ? (
            <>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-theme-primary">
                  Class
                </span>
                <select
                  className="ms-input w-full"
                  value={fClassId}
                  onChange={(e) => setFClassId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {upper.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-theme-primary">
                  Exam type
                </span>
                <select
                  className="ms-input w-full"
                  value={fTypeId}
                  onChange={(e) => setFTypeId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {examTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-theme-primary">
                <input
                  type="checkbox"
                  checked={fOpenNow}
                  onChange={(e) => setFOpenNow(e.target.checked)}
                />
                Open for marking immediately
              </label>
            </>
          ) : null}

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-theme-primary">
              Name
            </span>
            <input
              className="ms-input w-full"
              value={fName}
              onChange={(e) => setFName(e.target.value)}
              placeholder="Optional — defaults to type · class · term"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-theme-primary">
              Notes
            </span>
            <textarea
              className="ms-input w-full"
              rows={2}
              value={fNotes}
              onChange={(e) => setFNotes(e.target.value)}
            />
          </label>

          {showSubjectPicker ? (
            <div>
              <p className="mb-2 text-sm font-medium text-theme-primary">
                Subjects in this exam
              </p>
              {!examableSubjects.length ? (
                <p className="text-sm text-theme-muted">
                  No subjects installed. Use Primary setup → Install default subjects.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {examableSubjects.map((s) => {
                    const on = selectedSubjects.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleSubject(s.id)}
                        className={[
                          "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                          on
                            ? "border-theme-accent bg-theme-accent-muted text-theme-primary"
                            : "border-theme text-theme-muted hover:bg-nav-hover",
                        ].join(" ")}
                      >
                        {s.code}
                        {s.isPleSubject ? " · agg" : ""}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="mt-2 text-xs text-theme-muted">
                Aggregate ranking uses subjects marked “agg” (PLE cores).
                {editing && editing.hasMarks
                  ? " Subjects cannot change after marks are entered."
                  : ""}
              </p>
            </div>
          ) : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onCancel={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
        title={
          deleteMode === "hard" ? "Permanently delete exam?" : "Delete exam?"
        }
        description={
          deleteMode === "hard"
            ? `${toDelete?.name ?? "This exam"} will be permanently removed. This is only allowed when the exam has no marks.`
            : `${toDelete?.name ?? "This exam"} will be soft-deleted and hidden from teachers. Marks are kept and you can restore it later.`
        }
        confirmLabel={deleteMode === "hard" ? "Delete permanently" : "Soft delete"}
        variant="danger"
        loading={softDelete.isPending || hardDelete.isPending}
      />
    </DashboardPage>
  );
}
