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
  isLowerPrimaryLevel,
  schoolOffersPrimary,
  type PrimaryThematicSitting,
  type PrimaryThematicSittingStatus,
} from "@makyschool/shared";
import { useSchool } from "@/providers/SchoolProvider";
import { useToast } from "@/providers/ToastProvider";
import { useCan } from "@/hooks/useCurrentRole";
import { useCurrentTerm } from "@/hooks/useCurrentTerm";
import {
  useClosePrimarySitting,
  useCreatePrimarySitting,
  useHardDeletePrimarySitting,
  useOpenPrimarySitting,
  usePrimaryClasses,
  usePrimaryExamTypes,
  usePrimarySittings,
  useRestorePrimarySitting,
  useSoftDeletePrimarySitting,
  useUpdatePrimarySitting,
} from "@/hooks/usePrimary";

const STATUS_LABEL: Record<PrimaryThematicSittingStatus, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
};

export function PrimarySittingsContent() {
  const { school } = useSchool();
  const offers = schoolOffersPrimary(school?.school_type);
  const { toast } = useToast();
  const canManage = useCan("managePrimarySetup");
  const canView = useCan("viewPrimaryResults");

  const { data: term } = useCurrentTerm();
  const { data: classes = [] } = usePrimaryClasses(offers);
  const lower = useMemo(
    () => classes.filter((c) => isLowerPrimaryLevel(c.level)),
    [classes],
  );

  const [classId, setClassId] = useState("");
  const [statusFilter, setStatusFilter] = useState<PrimaryThematicSittingStatus | "">(
    "",
  );
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const { data: examTypes = [] } = usePrimaryExamTypes(offers, true);
  const {
    data: sittings = [],
    isPending,
    isError,
    refetch,
  } = usePrimarySittings(
    {
      classId: classId || undefined,
      termId: term?.id,
      status: statusFilter || undefined,
      includeDeleted: canManage && includeDeleted,
    },
    offers && !!term?.id,
  );

  const createSitting = useCreatePrimarySitting();
  const updateSitting = useUpdatePrimarySitting();
  const softDelete = useSoftDeletePrimarySitting();
  const hardDelete = useHardDeletePrimarySitting();
  const restoreSitting = useRestorePrimarySitting();
  const openSitting = useOpenPrimarySitting();
  const closeSitting = useClosePrimarySitting();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PrimaryThematicSitting | null>(null);
  const [toDelete, setToDelete] = useState<PrimaryThematicSitting | null>(null);
  const [deleteMode, setDeleteMode] = useState<"soft" | "hard">("soft");

  const [fClassId, setFClassId] = useState("");
  const [fTypeId, setFTypeId] = useState("");
  const [fName, setFName] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [fOpenNow, setFOpenNow] = useState(true);

  if (!offers) {
    return (
      <DashboardPage embedded maxWidth="7xl" title="Thematic sittings">
        <EmptyState
          title="Primary not enabled"
          description="Not available for secondary-only schools."
        />
      </DashboardPage>
    );
  }

  function openCreate() {
    setEditing(null);
    setFClassId(classId || lower[0]?.id || "");
    setFTypeId(examTypes[0]?.id ?? "");
    setFName("");
    setFNotes("");
    setFOpenNow(true);
    setFormOpen(true);
  }

  function openEdit(sitting: PrimaryThematicSitting) {
    setEditing(sitting);
    setFName(sitting.name);
    setFNotes(sitting.notes ?? "");
    setFormOpen(true);
  }

  async function submitForm() {
    try {
      if (editing) {
        await updateSitting.mutateAsync({
          id: editing.id,
          payload: { name: fName.trim(), notes: fNotes.trim() || null },
        });
        toast.success("Sitting updated.");
      } else {
        if (!fClassId || !term?.id || !fTypeId) {
          toast.error("Select class, term, and exam type.");
          return;
        }
        const created = await createSitting.mutateAsync({
          classId: fClassId,
          termId: term.id,
          examTypeId: fTypeId,
          name: fName.trim() || null,
          notes: fNotes.trim() || null,
          openNow: fOpenNow,
        });
        toast.success(
          created.status === "open"
            ? `${created.name} created and opened for assessment.`
            : `${created.name} created as draft.`,
        );
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save sitting.");
    }
  }

  async function toggleStatus(sitting: PrimaryThematicSitting) {
    try {
      if (sitting.status === "open") {
        await closeSitting.mutateAsync(sitting.id);
        toast.success(`${sitting.name} closed.`);
      } else {
        await openSitting.mutateAsync(sitting.id);
        toast.success(`${sitting.name} opened for assessment.`);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update sitting status.",
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
      toast.error(
        err instanceof Error ? err.message : "Could not delete sitting.",
      );
      setToDelete(null);
    }
  }

  async function onRestore(sitting: PrimaryThematicSitting) {
    try {
      await restoreSitting.mutateAsync(sitting.id);
      toast.success(`${sitting.name} restored.`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not restore sitting.",
      );
    }
  }

  const formBusy = createSitting.isPending || updateSitting.isPending;

  return (
    <DashboardPage
      embedded
      maxWidth="7xl"
      eyebrow="Primary"
      title="Thematic sittings"
      description="Create and open BOT/MID/EOT sittings for P1–P3. Teachers enter levels and comments; you close the sitting and approve report cards."
      actions={
        canManage ? (
          <button type="button" className="ms-btn-primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Create sitting
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
              {lower.map((c) => (
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
                setStatusFilter(e.target.value as PrimaryThematicSittingStatus | "")
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
        </div>

        {!lower.length ? (
          <EmptyState
            title="No P1–P3 classes"
            description="Create lower primary classes first. Subject exams remain on Exams for P4–P7."
          />
        ) : isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : isError ? (
          <EmptyState
            title="Could not load sittings"
            description="Check your connection and try again."
            action={
              <button type="button" className="ms-btn-secondary" onClick={() => void refetch()}>
                Retry
              </button>
            }
          />
        ) : !sittings.length ? (
          <EmptyState
            title="No thematic sittings yet"
            description={
              canManage
                ? "Create a BOT, Mid Term, or EOT sitting for a P1–P3 class."
                : "Ask an admin to create thematic sittings for this term."
            }
            action={
              canManage ? (
                <button type="button" className="ms-btn-primary" onClick={openCreate}>
                  Create sitting
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-theme">
            <table className="min-w-full text-sm">
              <thead className="bg-theme-raised/50 text-[11px] uppercase text-theme-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Sitting</th>
                  <th className="px-3 py-2 text-left">Class</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme">
                {sittings.map((s) => (
                  <tr
                    key={s.id}
                    className={
                      s.deleted
                        ? "bg-theme-surface/60 opacity-70"
                        : "bg-theme-surface"
                    }
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium text-theme-primary">{s.name}</div>
                      {s.hasMarks ? (
                        <div className="text-xs text-theme-muted">Has assessments</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-theme-secondary">{s.className}</td>
                    <td className="px-3 py-2 text-theme-secondary">
                      {s.examTypeName ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-md bg-theme-raised px-2 py-0.5 text-xs font-medium">
                        {s.deleted ? "Deleted" : STATUS_LABEL[s.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        {!s.deleted && canView ? (
                          <Link
                            href={`/dashboard/primary/marks/thematic?classId=${s.classId}&sittingId=${s.id}`}
                            className="ms-btn-ghost inline-flex items-center gap-1 px-2 py-1 text-xs"
                          >
                            <ClipboardList className="h-3.5 w-3.5" />
                            Progress
                          </Link>
                        ) : null}
                        {!s.deleted && canView ? (
                          <button
                            type="button"
                            className="ms-btn-ghost inline-flex items-center gap-1 px-2 py-1 text-xs"
                            onClick={() => void toggleStatus(s)}
                          >
                            {s.status === "open" ? (
                              <Lock className="h-3.5 w-3.5" />
                            ) : (
                              <LockOpen className="h-3.5 w-3.5" />
                            )}
                            {s.status === "open" ? "Close" : "Open"}
                          </button>
                        ) : null}
                        {!s.deleted && canManage ? (
                          <button
                            type="button"
                            className="ms-btn-ghost px-2 py-1 text-xs"
                            onClick={() => openEdit(s)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                        {s.deleted && canManage ? (
                          <button
                            type="button"
                            className="ms-btn-ghost inline-flex items-center gap-1 px-2 py-1 text-xs"
                            onClick={() => void onRestore(s)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Restore
                          </button>
                        ) : null}
                        {canManage ? (
                          <button
                            type="button"
                            className="ms-btn-ghost px-2 py-1 text-xs text-red-600"
                            onClick={() => {
                              setDeleteMode(s.deleted || !s.hasMarks ? "hard" : "soft");
                              setToDelete(s);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Edit sitting" : "Create thematic sitting"}
      >
        <div className="space-y-3">
          {!editing ? (
            <>
              <label className="block">
                <span className="mb-1 block text-xs text-theme-muted">Class</span>
                <select
                  className="ms-input w-full"
                  value={fClassId}
                  onChange={(e) => setFClassId(e.target.value)}
                >
                  {lower.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-theme-muted">Exam type</span>
                <select
                  className="ms-input w-full"
                  value={fTypeId}
                  onChange={(e) => setFTypeId(e.target.value)}
                >
                  {examTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Name (optional)</span>
            <input
              className="ms-input w-full"
              value={fName}
              onChange={(e) => setFName(e.target.value)}
              placeholder="Auto-generated if blank"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Notes</span>
            <textarea
              className="ms-input w-full"
              rows={2}
              value={fNotes}
              onChange={(e) => setFNotes(e.target.value)}
            />
          </label>
          {!editing ? (
            <label className="flex items-center gap-2 text-sm text-theme-secondary">
              <input
                type="checkbox"
                checked={fOpenNow}
                onChange={(e) => setFOpenNow(e.target.checked)}
              />
              Open immediately for assessment
            </label>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="ms-btn-secondary"
              onClick={() => setFormOpen(false)}
            >
              Cancel
            </button>
            <LoadingButton loading={formBusy} onClick={() => void submitForm()}>
              {editing ? "Save" : "Create"}
            </LoadingButton>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onCancel={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
        title={
          deleteMode === "hard" ? "Permanently delete sitting?" : "Delete sitting?"
        }
        description={
          deleteMode === "hard"
            ? `${toDelete?.name ?? "This sitting"} will be permanently removed.`
            : `${toDelete?.name ?? "This sitting"} will be soft-deleted. You can restore it later.`
        }
        confirmLabel={deleteMode === "hard" ? "Delete permanently" : "Soft delete"}
        variant="danger"
        loading={softDelete.isPending || hardDelete.isPending}
      />
    </DashboardPage>
  );
}
