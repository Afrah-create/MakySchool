"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { Modal } from "@makyschool/ui/components/ui/Modal";
import { ConfirmDialog } from "@makyschool/ui/components/ui/ConfirmDialog";
import {
  schoolOffersPrimary,
  type PrimaryExamTypeOption,
} from "@makyschool/shared";
import { useSchool } from "@/providers/SchoolProvider";
import { useToast } from "@/providers/ToastProvider";
import { useCan } from "@/hooks/useCurrentRole";
import {
  useCreatePrimaryExamType,
  useDeletePrimaryExamType,
  usePrimaryExamTypes,
  useUpdatePrimaryExamType,
} from "@/hooks/usePrimary";

export function PrimaryExamTypesContent() {
  const { school } = useSchool();
  const offers = schoolOffersPrimary(school?.school_type);
  const { toast } = useToast();
  const canManage = useCan("managePrimarySetup");

  const { data: types = [], isPending } = usePrimaryExamTypes(offers);
  const createType = useCreatePrimaryExamType();
  const updateType = useUpdatePrimaryExamType();
  const deleteType = useDeletePrimaryExamType();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [editing, setEditing] = useState<PrimaryExamTypeOption | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editOrder, setEditOrder] = useState(0);
  const [toDelete, setToDelete] = useState<PrimaryExamTypeOption | null>(null);

  if (!offers) {
    return (
      <DashboardPage embedded maxWidth="5xl" title="Exam types">
        <EmptyState
          title="Primary not enabled"
          description="Not available for secondary-only schools."
        />
      </DashboardPage>
    );
  }

  async function create() {
    if (!name.trim() || !code.trim()) {
      toast.error("Name and code are required.");
      return;
    }
    try {
      await createType.mutateAsync({
        name: name.trim(),
        code: code.trim().toUpperCase(),
        sortOrder: types.length + 1,
      });
      toast.success("Exam type created.");
      setName("");
      setCode("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed.");
    }
  }

  function openEdit(t: PrimaryExamTypeOption) {
    setEditing(t);
    setEditName(t.name);
    setEditCode(t.code);
    setEditOrder(t.sortOrder);
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      await updateType.mutateAsync({
        id: editing.id,
        payload: {
          name: editName.trim(),
          code: editCode.trim().toUpperCase(),
          sortOrder: editOrder,
        },
      });
      toast.success("Exam type updated.");
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    }
  }

  async function toggleActive(t: PrimaryExamTypeOption) {
    try {
      await updateType.mutateAsync({
        id: t.id,
        payload: { isActive: !t.isActive },
      });
      toast.success(t.isActive ? "Exam type deactivated." : "Exam type activated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await deleteType.mutateAsync(toDelete.id);
      toast.success(`${toDelete.name} deleted.`);
      setToDelete(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete.");
      setToDelete(null);
    }
  }

  return (
    <DashboardPage
      embedded
      maxWidth="5xl"
      eyebrow="Primary"
      title="Exam types"
      description="BOT, Mid-term, End of term, Mock — each exam is graded on its own. Deactivate unused types; hard-delete only when no exams use them."
    >
      <div className="space-y-4">
        {canManage ? (
          <div className="flex flex-wrap gap-2 rounded-xl border border-theme bg-theme-surface p-4">
            <input
              className="ms-input"
              placeholder="Name (e.g. Mid Term)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="ms-input w-28"
              placeholder="Code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <LoadingButton
              loading={createType.isPending}
              onClick={() => void create()}
            >
              Add type
            </LoadingButton>
          </div>
        ) : null}

        {isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-theme">
            <table className="min-w-full text-sm">
              <thead className="bg-theme-raised/50 text-[11px] uppercase text-theme-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Order</th>
                  <th className="px-3 py-2 text-left">Active</th>
                  {canManage ? (
                    <th className="px-3 py-2 text-right">Actions</th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-theme">
                {types.map((t) => (
                  <tr key={t.id} className={t.isActive ? "" : "opacity-60"}>
                    <td className="px-3 py-2 font-mono text-xs">{t.code}</td>
                    <td className="px-3 py-2 font-medium">{t.name}</td>
                    <td className="px-3 py-2">{t.sortOrder}</td>
                    <td className="px-3 py-2">{t.isActive ? "Yes" : "No"}</td>
                    {canManage ? (
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap justify-end gap-1">
                          <button
                            type="button"
                            className="ms-btn-ghost px-2 py-1 text-xs"
                            onClick={() => void toggleActive(t)}
                          >
                            {t.isActive ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            type="button"
                            className="ms-btn-ghost px-2 py-1"
                            onClick={() => openEdit(t)}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="ms-btn-ghost px-2 py-1 text-theme-danger"
                            onClick={() => setToDelete(t)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit exam type"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="ms-btn-ghost"
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
            <LoadingButton
              variant="primary"
              loading={updateType.isPending}
              onClick={() => void saveEdit()}
            >
              Save
            </LoadingButton>
          </div>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Name</span>
            <input
              className="ms-input w-full"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Code</span>
            <input
              className="ms-input w-full"
              value={editCode}
              onChange={(e) => setEditCode(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Sort order</span>
            <input
              className="ms-input w-full"
              type="number"
              value={editOrder}
              onChange={(e) => setEditOrder(Number(e.target.value) || 0)}
            />
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onCancel={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
        title="Delete exam type?"
        description={`${toDelete?.name ?? "This type"} can only be deleted if no exams use it (including soft-deleted exams). Prefer deactivating instead.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleteType.isPending}
      />
    </DashboardPage>
  );
}
