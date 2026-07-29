"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Download,
  FolderOpen,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { SlideOver } from "@makyschool/ui/components/ui/SlideOver";
import { ConfirmDialog } from "@makyschool/ui/components/ui/ConfirmDialog";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import type { SubjectResource } from "@makyschool/shared";
import { useToast } from "@/providers/ToastProvider";
import { useApiSWR } from "@/hooks/useApiSWR";
import { useCurrentTerm } from "@/hooks/useCurrentTerm";
import {
  useInvalidateResources,
  useResourceTerms,
  useSetResourceVisibility,
  useSubjectResources,
} from "@/hooks/useResources";
import { putFileWithProgress, resourcesApi } from "@/lib/api/resources";
import type { TeacherDetail } from "@/lib/teachers/types";
import {
  formatBytes,
  formatShortDate,
  RESOURCE_ACCEPT,
  validateResourceFile,
} from "@/lib/resources/format";
import { FileDropZone } from "@/components/resources/FileDropZone";
import { ResourceTypeIcon } from "@/components/resources/ResourceTypeIcon";
import { UploadProgressBar } from "@/components/resources/UploadProgressBar";

type AssignmentOption = {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
};

export function TeacherResourcesContent() {
  const { toast } = useToast();
  const { data: term } = useCurrentTerm();
  const { data: terms = [] } = useResourceTerms();
  const { data: me } = useApiSWR<TeacherDetail>("/schools/teachers/me");
  const { invalidateSubjectResources } = useInvalidateResources();
  const visibilityMutation = useSetResourceVisibility();

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
    if (!classId && classes[0]) setClassId(classes[0].id);
  }, [classes, classId]);

  const subjectsForClass = useMemo(
    () => assignments.filter((a) => a.classId === classId),
    [assignments, classId],
  );

  useEffect(() => {
    if (subjectId && !subjectsForClass.some((s) => s.subjectId === subjectId)) {
      setSubjectId("");
    }
  }, [subjectsForClass, subjectId]);

  const { data: resources = [], isPending, isError, refetch } = useSubjectResources(
    {
      classId: classId || undefined,
      subjectId: subjectId || undefined,
      termId: termId || undefined,
    },
    !!classId,
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SubjectResource | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SubjectResource | null>(null);
  const [unpublishTarget, setUnpublishTarget] = useState<SubjectResource | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

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

  function openUpload() {
    setUClassId(classId || classes[0]?.id || "");
    setUSubjectId(subjectId || "");
    setUTermId(termId || term?.id || "");
    setUTitle("");
    setUDescription("");
    setUFile(null);
    setProgress(0);
    setUploadOpen(true);
  }

  async function handleUpload() {
    if (!uFile || !uClassId || !uSubjectId || !uTitle.trim()) {
      toast.error("Please fill in class, subject, title, and choose a file.");
      return;
    }
    const validation = validateResourceFile(uFile);
    if (validation) {
      toast.error(validation);
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const upload = await resourcesApi.requestSubjectResourceUpload({
        classId: uClassId,
        subjectId: uSubjectId,
        termId: uTermId || null,
        title: uTitle.trim(),
        description: uDescription.trim() || null,
        filename: uFile.name,
        fileSize: uFile.size,
        fileType: uFile.type || "application/octet-stream",
      });
      await putFileWithProgress(upload, uFile, setProgress);
      await resourcesApi.confirmSubjectResource(upload.resourceId);
      toast.success("Resource uploaded. Publish it when you are ready for students.");
      setUploadOpen(false);
      await invalidateSubjectResources();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(resource: SubjectResource) {
    try {
      const { url } = await resourcesApi.downloadSubjectResource(resource.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed.");
    }
  }

  async function togglePublish(resource: SubjectResource, next: boolean) {
    if (!next) {
      setUnpublishTarget(resource);
      return;
    }
    try {
      await visibilityMutation.mutateAsync({ id: resource.id, isPublished: true });
      toast.success("Resource published.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not publish.");
    }
  }

  async function confirmUnpublish() {
    if (!unpublishTarget) return;
    try {
      await visibilityMutation.mutateAsync({
        id: unpublishTarget.id,
        isPublished: false,
      });
      toast.success("Resource unpublished.");
      setUnpublishTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not unpublish.");
    }
  }

  async function handleEditSave() {
    if (!editTarget?.title.trim()) {
      toast.error("Title is required.");
      return;
    }
    try {
      await resourcesApi.patchSubjectResource(editTarget.id, {
        title: editTarget.title.trim(),
        description: editTarget.description ?? null,
      });
      toast.success("Resource updated.");
      setEditTarget(null);
      await invalidateSubjectResources();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update.");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await resourcesApi.deleteSubjectResource(deleteTarget.id);
      toast.success("Resource deleted.");
      setDeleteTarget(null);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(deleteTarget.id);
        return next;
      });
      await invalidateSubjectResources();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete.");
    } finally {
      setDeleting(false);
    }
  }

  async function moveResource(id: string, direction: -1 | 1) {
    const ids = resources.map((r) => r.id);
    const index = ids.indexOf(id);
    const swap = index + direction;
    if (index < 0 || swap < 0 || swap >= ids.length) return;
    const next = [...ids];
    [next[index], next[swap]] = [next[swap], next[index]];
    try {
      await resourcesApi.reorder(next);
      await invalidateSubjectResources();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reorder.");
    }
  }

  async function bulkAction(action: "publish" | "unpublish" | "delete") {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBulkBusy(true);
    try {
      if (action === "delete") {
        for (const id of ids) {
          await resourcesApi.deleteSubjectResource(id);
        }
        toast.success(`Deleted ${ids.length} resource(s).`);
      } else {
        const published = action === "publish";
        for (const id of ids) {
          await resourcesApi.setVisibility(id, published);
        }
        toast.success(
          published
            ? `Published ${ids.length} resource(s).`
            : `Unpublished ${ids.length} resource(s).`,
        );
      }
      setSelected(new Set());
      await invalidateSubjectResources();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk action failed.");
    } finally {
      setBulkBusy(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <DashboardPage
      embedded
      maxWidth="7xl"
      eyebrow="Teacher portal"
      title="Subject resources"
      description="Upload materials for your classes. Students only see published resources."
      actions={
        <button type="button" className="ms-btn-primary" onClick={openUpload}>
          <Upload className="mr-2 h-4 w-4" />
          Upload resource
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
              <option value="">Any term</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-theme bg-theme-surface px-4 py-3">
            <span className="text-sm text-theme-muted">{selected.size} selected</span>
            <button
              type="button"
              className="ms-btn-secondary text-xs"
              disabled={bulkBusy}
              onClick={() => void bulkAction("publish")}
            >
              Publish
            </button>
            <button
              type="button"
              className="ms-btn-secondary text-xs"
              disabled={bulkBusy}
              onClick={() => void bulkAction("unpublish")}
            >
              Unpublish
            </button>
            <button
              type="button"
              className="ms-btn-secondary text-xs text-red-600"
              disabled={bulkBusy}
              onClick={() => void bulkAction("delete")}
            >
              Delete
            </button>
            <button
              type="button"
              className="text-xs text-theme-muted underline"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </button>
          </div>
        ) : null}

        {!classId ? (
          <EmptyState
            icon={FolderOpen}
            title="No classes assigned"
            description="Ask your admin to assign you to classes and subjects."
          />
        ) : isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : isError ? (
          <EmptyState
            icon={FolderOpen}
            title="Could not load resources"
            description="Please try again."
            action={
              <button type="button" className="ms-btn-secondary" onClick={() => void refetch()}>
                Retry
              </button>
            }
          />
        ) : resources.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No resources yet"
            description="Upload PDFs, documents, or videos for this class. New uploads start unpublished."
            action={
              <button type="button" className="ms-btn-primary" onClick={openUpload}>
                Upload resource
              </button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {resources.map((resource, index) => (
              <li
                key={resource.id}
                className="flex flex-col gap-3 rounded-xl border border-theme bg-theme-surface p-4 sm:flex-row sm:items-center"
              >
                <div className="flex items-start gap-3 sm:min-w-0 sm:flex-1">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(resource.id)}
                    onChange={() => toggleSelect(resource.id)}
                    aria-label={`Select ${resource.title}`}
                  />
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-theme-raised text-theme-muted">
                    <ResourceTypeIcon type={resource.resourceType} className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-theme-primary">{resource.title}</h3>
                    {resource.description ? (
                      <p className="mt-0.5 line-clamp-2 text-sm text-theme-muted">
                        {resource.description}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-theme-faint">
                      {resource.subjectName} · {formatBytes(resource.fileSize)} ·{" "}
                      {formatShortDate(resource.uploadedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                  <label className="flex items-center gap-2 text-sm text-theme-muted">
                    <span className="sr-only">Published</span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={resource.isPublished}
                      onChange={(e) => void togglePublish(resource, e.target.checked)}
                    />
                    <span>{resource.isPublished ? "Published" : "Unpublished"}</span>
                  </label>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-theme-muted hover:bg-nav-hover"
                    aria-label="Move up"
                    disabled={index === 0}
                    onClick={() => void moveResource(resource.id, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-theme-muted hover:bg-nav-hover"
                    aria-label="Move down"
                    disabled={index === resources.length - 1}
                    onClick={() => void moveResource(resource.id, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-theme-muted hover:bg-nav-hover"
                    aria-label="Download"
                    onClick={() => void handleDownload(resource)}
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-theme-muted hover:bg-nav-hover"
                    aria-label="Edit"
                    onClick={() => setEditTarget({ ...resource })}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-theme-muted hover:bg-nav-hover"
                    aria-label="Delete"
                    onClick={() => setDeleteTarget(resource)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SlideOver
        open={uploadOpen}
        onClose={() => !uploading && setUploadOpen(false)}
        title="Upload resource"
        description="Students will not see this until you publish it."
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
              className="flex-1"
              loading={uploading}
              onClick={() => void handleUpload()}
            >
              Upload
            </LoadingButton>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-theme-muted">Class</span>
            <select
              className="ms-input w-full"
              value={uClassId}
              disabled={uploading}
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
              disabled={uploading || !uClassId}
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
            <span className="mb-1 block text-sm font-medium text-theme-muted">
              Term (optional)
            </span>
            <select
              className="ms-input w-full"
              value={uTermId}
              disabled={uploading}
              onChange={(e) => setUTermId(e.target.value)}
            >
              <option value="">Any / spanning terms</option>
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
            accept={RESOURCE_ACCEPT}
            file={uFile}
            onChange={setUFile}
            disabled={uploading}
            helperText="PDF, Word, PowerPoint, or video · docs 100MB / video 2GB"
          />
          {uploading ? <UploadProgressBar value={progress} /> : null}
        </div>
      </SlideOver>

      <SlideOver
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit resource"
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
          </div>
        ) : null}
      </SlideOver>

      <ConfirmDialog
        open={!!unpublishTarget}
        title="Unpublish resource?"
        description="Students will lose access to this resource until you publish it again."
        confirmLabel="Unpublish"
        variant="danger"
        loading={visibilityMutation.isPending}
        onCancel={() => setUnpublishTarget(null)}
        onConfirm={() => void confirmUnpublish()}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete resource?"
        description="This permanently removes the file. Published resources are unpublished first."
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
      />
    </DashboardPage>
  );
}
