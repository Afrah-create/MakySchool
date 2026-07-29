"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Pencil, Replace, Trash2, Upload } from "lucide-react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { SlideOver } from "@makyschool/ui/components/ui/SlideOver";
import { ConfirmDialog } from "@makyschool/ui/components/ui/ConfirmDialog";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import type { TeachingPlan } from "@makyschool/shared";
import { useToast } from "@/providers/ToastProvider";
import { useApiSWR } from "@/hooks/useApiSWR";
import { useCurrentTerm } from "@/hooks/useCurrentTerm";
import {
  useInvalidateResources,
  useResourceTerms,
  useTeachingPlans,
} from "@/hooks/useResources";
import { putFileWithProgress, resourcesApi } from "@/lib/api/resources";
import type { TeacherDetail } from "@/lib/teachers/types";
import {
  formatBytes,
  formatShortDate,
  PLAN_ACCEPT,
  validatePlanFile,
} from "@/lib/resources/format";
import { FileDropZone } from "@/components/resources/FileDropZone";
import { UploadProgressBar } from "@/components/resources/UploadProgressBar";

type AssignmentOption = {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
};

export function TeacherTeachingPlansContent() {
  const { toast } = useToast();
  const { data: term } = useCurrentTerm();
  const { data: terms = [] } = useResourceTerms();
  const { data: me } = useApiSWR<TeacherDetail>("/schools/teachers/me");
  const { invalidatePlans } = useInvalidateResources();

  const assignments = useMemo<AssignmentOption[]>(() => {
    const list: AssignmentOption[] = [];
    for (const a of me?.assignments ?? []) {
      if (!a.subject_id) continue;
      list.push({
        classId: a.class_id,
        className: a.class_name ?? a.class_id,
        subjectId: a.subject_id,
        subjectName: a.subject_name ?? "Subject",
      });
    }
    return list;
  }, [me]);

  const classes = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of assignments) map.set(a.classId, a.className);
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [assignments]);

  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [termId, setTermId] = useState("");

  useEffect(() => {
    if (!termId && term?.id) setTermId(term.id);
  }, [term?.id, termId]);

  const subjectsForClass = useMemo(
    () => assignments.filter((a) => a.classId === classId),
    [assignments, classId],
  );

  useEffect(() => {
    if (subjectId && !subjectsForClass.some((s) => s.subjectId === subjectId)) {
      setSubjectId("");
    }
  }, [subjectsForClass, subjectId]);

  const { data: plans = [], isPending, isError, refetch } = useTeachingPlans(
    {
      classId: classId || undefined,
      subjectId: subjectId || undefined,
      termId: termId || undefined,
    },
    true,
  );

  const [uploadOpen, setUploadOpen] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<TeachingPlan | null>(null);
  const [editTarget, setEditTarget] = useState<TeachingPlan | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeachingPlan | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Upload form state
  const [uClassId, setUClassId] = useState("");
  const [uSubjectId, setUSubjectId] = useState("");
  const [uTermId, setUTermId] = useState("");
  const [uTitle, setUTitle] = useState("");
  const [uDescription, setUDescription] = useState("");
  const [uFile, setUFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const uSubjects = useMemo(
    () => assignments.filter((a) => a.classId === uClassId),
    [assignments, uClassId],
  );

  const existingForCombo = useMemo(() => {
    if (!uClassId || !uSubjectId || !uTermId) return null;
    return (
      plans.find(
        (p) =>
          p.classId === uClassId &&
          p.subjectId === uSubjectId &&
          p.termId === uTermId,
      ) ?? null
    );
  }, [plans, uClassId, uSubjectId, uTermId]);

  function openUpload(prefill?: TeachingPlan) {
    setReplaceTarget(prefill ?? null);
    setUClassId(prefill?.classId ?? classId ?? classes[0]?.id ?? "");
    setUSubjectId(prefill?.subjectId ?? subjectId ?? "");
    setUTermId(prefill?.termId ?? (termId || term?.id || ""));
    setUTitle(prefill?.title ?? "");
    setUDescription(prefill?.description ?? "");
    setUFile(null);
    setProgress(0);
    setUploadOpen(true);
  }

  async function handleUpload() {
    if (!uFile || !uClassId || !uSubjectId || !uTermId || !uTitle.trim()) {
      toast.error("Please fill in all required fields and choose a file.");
      return;
    }
    const validation = validatePlanFile(uFile);
    if (validation) {
      toast.error(validation);
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      const upload = await resourcesApi.requestTeachingPlanUpload({
        classId: uClassId,
        subjectId: uSubjectId,
        termId: uTermId,
        title: uTitle.trim(),
        description: uDescription.trim() || null,
        filename: uFile.name,
        fileSize: uFile.size,
        fileType: uFile.type || "application/octet-stream",
      });
      await putFileWithProgress(upload, uFile, setProgress);
      await resourcesApi.confirmTeachingPlan(upload.resourceId);
      toast.success(
        upload.replacesExisting || replaceTarget
          ? "Teaching plan replaced."
          : "Teaching plan uploaded.",
      );
      setUploadOpen(false);
      await invalidatePlans();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(plan: TeachingPlan) {
    try {
      const { url } = await resourcesApi.downloadTeachingPlan(plan.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed.");
    }
  }

  async function handleEditSave() {
    if (!editTarget || !editTarget.title.trim()) {
      toast.error("Title is required.");
      return;
    }
    try {
      await resourcesApi.patchTeachingPlan(editTarget.id, {
        title: editTarget.title.trim(),
        description: editTarget.description ?? null,
      });
      toast.success("Teaching plan updated.");
      setEditTarget(null);
      await invalidatePlans();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update plan.");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await resourcesApi.deleteTeachingPlan(deleteTarget.id);
      toast.success("Teaching plan deleted.");
      setDeleteTarget(null);
      await invalidatePlans();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete plan.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <DashboardPage
      embedded
      maxWidth="7xl"
      eyebrow="Teacher portal"
      title="Teaching plans"
      description={
        term?.name
          ? `Upload and manage your term teaching plans · ${term.name}`
          : "Upload and manage your term teaching plans"
      }
      actions={
        <button type="button" className="ms-btn-primary" onClick={() => openUpload()}>
          <Upload className="mr-2 h-4 w-4" />
          Upload plan
        </button>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-3 rounded-xl border border-theme bg-theme-raised/40 p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block sm:min-w-[10rem] sm:flex-1">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
              Class
            </span>
            <select
              className="ms-input w-full"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
            >
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:min-w-[10rem] sm:flex-1">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
              Subject
            </span>
            <select
              className="ms-input w-full"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              disabled={!classId}
            >
              <option value="">All subjects</option>
              {subjectsForClass.map((s) => (
                <option key={s.subjectId} value={s.subjectId}>
                  {s.subjectName}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:min-w-[10rem] sm:flex-1">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
              Term
            </span>
            <select
              className="ms-input w-full"
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
            >
              <option value="">All terms</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.isCurrent ? " (current)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        {isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : isError ? (
          <EmptyState
            icon={FileText}
            title="Could not load teaching plans"
            description="Please try again."
            action={
              <button type="button" className="ms-btn-secondary" onClick={() => void refetch()}>
                Retry
              </button>
            }
          />
        ) : plans.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No teaching plans yet"
            description="Upload a PDF or Word document for each class and subject you teach."
            action={
              <button type="button" className="ms-btn-primary" onClick={() => openUpload()}>
                Upload plan
              </button>
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto rounded-xl border border-theme md:block">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-theme-raised/50 text-[11px] uppercase tracking-wider text-theme-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Title</th>
                    <th className="px-4 py-3 font-semibold">Subject</th>
                    <th className="px-4 py-3 font-semibold">Class</th>
                    <th className="px-4 py-3 font-semibold">Term</th>
                    <th className="px-4 py-3 font-semibold">Size</th>
                    <th className="px-4 py-3 font-semibold">Uploaded</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme">
                  {plans.map((plan) => (
                    <tr key={plan.id} className="bg-theme-surface">
                      <td className="px-4 py-3 font-medium text-theme-primary">{plan.title}</td>
                      <td className="px-4 py-3 text-theme-muted">{plan.subjectName}</td>
                      <td className="px-4 py-3 text-theme-muted">{plan.className}</td>
                      <td className="px-4 py-3 text-theme-muted">{plan.termName}</td>
                      <td className="px-4 py-3 tabular-nums text-theme-muted">
                        {formatBytes(plan.fileSize)}
                      </td>
                      <td className="px-4 py-3 text-theme-muted">
                        {formatShortDate(plan.uploadedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <IconBtn label="Download" onClick={() => void handleDownload(plan)}>
                            <Download className="h-4 w-4" />
                          </IconBtn>
                          <IconBtn
                            label="Edit title"
                            onClick={() => setEditTarget({ ...plan })}
                          >
                            <Pencil className="h-4 w-4" />
                          </IconBtn>
                          <IconBtn label="Replace" onClick={() => openUpload(plan)}>
                            <Replace className="h-4 w-4" />
                          </IconBtn>
                          <IconBtn label="Delete" onClick={() => setDeleteTarget(plan)}>
                            <Trash2 className="h-4 w-4" />
                          </IconBtn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {plans.map((plan) => (
                <article
                  key={plan.id}
                  className="rounded-xl border border-theme bg-theme-surface p-4"
                >
                  <h3 className="font-semibold text-theme-primary">{plan.title}</h3>
                  <p className="mt-1 text-sm text-theme-muted">
                    {plan.subjectName} · {plan.className} · {plan.termName}
                  </p>
                  <p className="mt-1 text-xs text-theme-faint">
                    {formatBytes(plan.fileSize)} · {formatShortDate(plan.uploadedAt)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="ms-btn-secondary text-xs"
                      onClick={() => void handleDownload(plan)}
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      className="ms-btn-secondary text-xs"
                      onClick={() => setEditTarget({ ...plan })}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ms-btn-secondary text-xs"
                      onClick={() => openUpload(plan)}
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      className="ms-btn-secondary text-xs text-red-600"
                      onClick={() => setDeleteTarget(plan)}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>

      <SlideOver
        open={uploadOpen}
        onClose={() => !uploading && setUploadOpen(false)}
        title={replaceTarget ? "Replace teaching plan" : "Upload teaching plan"}
        description="PDF, DOC, or DOCX up to 50MB. One active plan per class, subject, and term."
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              className="ms-btn-secondary flex-1"
              disabled={uploading}
              onClick={() => setUploadOpen(false)}
            >
              Cancel
            </button>
            <LoadingButton
              className="ms-btn-primary flex-1"
              loading={uploading}
              onClick={() => void handleUpload()}
            >
              {uploading ? "Uploading…" : "Upload"}
            </LoadingButton>
          </div>
        }
      >
        <div className="space-y-4">
          {(existingForCombo || replaceTarget) && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
              A plan already exists for this selection. Uploading will replace it.
            </p>
          )}
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-theme-muted">Class</span>
            <select
              className="ms-input w-full"
              value={uClassId}
              disabled={uploading || !!replaceTarget}
              onChange={(e) => {
                setUClassId(e.target.value);
                setUSubjectId("");
              }}
            >
              <option value="">Select class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-theme-muted">Subject</span>
            <select
              className="ms-input w-full"
              value={uSubjectId}
              disabled={uploading || !uClassId || !!replaceTarget}
              onChange={(e) => setUSubjectId(e.target.value)}
            >
              <option value="">Select subject</option>
              {uSubjects.map((s) => (
                <option key={s.subjectId} value={s.subjectId}>
                  {s.subjectName}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-theme-muted">Term</span>
            <select
              className="ms-input w-full"
              value={uTermId}
              disabled={uploading || !!replaceTarget}
              onChange={(e) => setUTermId(e.target.value)}
            >
              <option value="">Select term</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-theme-muted">Title</span>
            <input
              className="ms-input w-full"
              value={uTitle}
              disabled={uploading}
              onChange={(e) => setUTitle(e.target.value)}
              placeholder="e.g. Term 2 Teaching Plan — Mathematics"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-theme-muted">
              Description (optional)
            </span>
            <textarea
              className="ms-input w-full min-h-[80px]"
              value={uDescription}
              disabled={uploading}
              onChange={(e) => setUDescription(e.target.value)}
            />
          </label>
          <FileDropZone
            accept={PLAN_ACCEPT}
            file={uFile}
            onChange={setUFile}
            disabled={uploading}
            helperText="PDF, DOC, or DOCX · max 50MB"
          />
          {uploading ? <UploadProgressBar value={progress} /> : null}
        </div>
      </SlideOver>

      <SlideOver
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit teaching plan"
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              className="ms-btn-secondary flex-1"
              onClick={() => setEditTarget(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="ms-btn-primary flex-1"
              onClick={() => void handleEditSave()}
            >
              Save
            </button>
          </div>
        }
      >
        {editTarget ? (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-theme-muted">Title</span>
              <input
                className="ms-input w-full"
                value={editTarget.title}
                onChange={(e) =>
                  setEditTarget({ ...editTarget, title: e.target.value })
                }
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-theme-muted">
                Description
              </span>
              <textarea
                className="ms-input w-full min-h-[80px]"
                value={editTarget.description ?? ""}
                onChange={(e) =>
                  setEditTarget({ ...editTarget, description: e.target.value })
                }
              />
            </label>
            <p className="text-xs text-theme-muted">
              To change the file, use Replace instead.
            </p>
          </div>
        ) : null}
      </SlideOver>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete teaching plan?"
        description="This removes the plan and its file. You can upload a new one later."
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
      />
    </DashboardPage>
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="rounded-lg p-2 text-theme-muted transition hover:bg-nav-hover hover:text-theme-primary"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
