"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { CanDo } from "@/components/ui/CanDo";
import { AddFeeStructurePanel } from "@/components/fees/AddFeeStructurePanel";
import { AssignFeeStructureDialog } from "@/components/fees/AssignFeeStructureDialog";
import { EditFeeStructurePanel } from "@/components/fees/EditFeeStructurePanel";
import { ConfirmDialog } from "@makyschool/ui/components/ui/ConfirmDialog";
import { DataListPanel } from "@makyschool/ui/components/ui/DataListPanel";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { TablePagination } from "@makyschool/ui/components/ui/TablePagination";
import { FeesPageShell } from "@/components/fees/FeesPageShell";
import { useApiSWR } from "@/hooks/useApiSWR";
import { useClientPagination } from "@/hooks/useClientPagination";
import { useFeesBasePath } from "@/hooks/useFeesBasePath";
import { deleteFeeStructure, restoreFeeStructure } from "@/lib/api/fees";
import { formatUGX } from "@/lib/formatCurrency";
import { type FeeStructure, type FeeStructureDetail } from "@/lib/fees/types";
import { useToast } from "@/providers/ToastProvider";

export function FeeStructuresContent() {
  const base = useFeesBasePath();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [assignStructure, setAssignStructure] = useState<FeeStructure | FeeStructureDetail | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FeeStructure | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const listPath = showDeleted
    ? "/schools/fees/structures?include_deleted=true"
    : "/schools/fees/structures";
  const { data, error, isLoading, mutate } = useApiSWR<FeeStructure[]>(listPath);
  const structures = (data ?? []).filter((row) => (showDeleted ? true : !row.deleted && !row.deleted_at));
  const {
    paged,
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
  } = useClientPagination({ items: structures });

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteFeeStructure(deleteTarget.id);
      toast.success(`Deleted fee structure for ${deleteTarget.class_name}.`);
      setDeleteTarget(null);
      void mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete fee structure.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleRestore(row: FeeStructure) {
    try {
      await restoreFeeStructure(row.id);
      toast.success(`Restored fee structure for ${row.class_name}.`);
      void mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restore fee structure.");
    }
  }

  return (
    <FeesPageShell
      title="Fee structures"
      description="Set expected fees per class and term."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-theme-muted">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => {
                setShowDeleted(e.target.checked);
                setPage(1);
              }}
            />
            Show deleted
          </label>
          <CanDo action="manageFees">
            <button type="button" className="ms-btn-primary inline-flex items-center gap-2" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add structure
            </button>
          </CanDo>
        </div>
      }
    >

      <DataListPanel>
        <QueryState
          error={error}
          isLoading={isLoading}
          data={data}
          onRetry={() => void mutate()}
          loading={<Skeleton className="m-4 h-48" />}
          empty={
            <div className="p-6">
              <EmptyState
                title="No fee structures yet."
                description="Create a fee structure for each class and term."
                action={
                  <CanDo action="manageFees">
                    <button type="button" className="ms-btn-primary" onClick={() => setAddOpen(true)}>
                      Add structure
                    </button>
                  </CanDo>
                }
              />
            </div>
          }
          isEmpty={(rows) => rows.length === 0}
        >
          {() => (
            <div className="space-y-4 p-4">
            <div className="overflow-x-auto">
              <table className="ms-table w-full min-w-[52rem]">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Term</th>
                    <th className="text-right">Total Amount</th>
                    <th className="text-right">Items</th>
                    <th>Status</th>
                    <th className="text-right">Students</th>
                    <th className="text-right">Collected</th>
                    <th className="text-right">Outstanding</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {paged.map((row) => {
                    const isDeleted = Boolean(row.deleted || row.deleted_at);
                    return (
                    <tr key={row.id} className={isDeleted ? "opacity-60" : undefined}>
                      <td className="font-medium">{row.class_name}</td>
                      <td className="whitespace-nowrap">
                        {row.term_name} {row.academic_year}
                      </td>
                      <td className="text-right tabular-nums">{formatUGX(Number(row.amount))}</td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="rounded-full bg-theme-surface-raised px-2 py-0.5 text-xs text-theme-muted hover:text-theme-accent"
                          onClick={() => setEditId(row.id)}
                        >
                          {row.item_count ?? row.items?.length ?? 0} items
                        </button>
                      </td>
                      <td>
                        {isDeleted ? (
                          <span className="rounded-full bg-theme-surface-raised px-2 py-0.5 text-xs text-theme-muted">
                            Deleted
                          </span>
                        ) : row.locked || row.locked_at ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/20 dark:text-amber-100">
                            Locked
                          </span>
                        ) : row.is_active === false ? (
                          <span className="rounded-full bg-theme-surface-raised px-2 py-0.5 text-xs text-theme-muted">
                            Inactive
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="text-right tabular-nums">
                        {row.student_count}
                        {!isDeleted && row.student_count === 0 ? (
                          <CanDo action="manageFees">
                            <button
                              type="button"
                              className="ml-2 text-xs text-theme-accent hover:underline"
                              onClick={() => setAssignStructure(row)}
                            >
                              Assign
                            </button>
                          </CanDo>
                        ) : null}
                      </td>
                      <td className="text-right tabular-nums">{formatUGX(Number(row.total_collected ?? 0))}</td>
                      <td className="text-right tabular-nums">{formatUGX(Number(row.total_outstanding ?? 0))}</td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <CanDo action="manageFees">
                            <button
                              type="button"
                              className="text-xs text-theme-accent hover:underline"
                              onClick={() => setEditId(row.id)}
                            >
                              {isDeleted ? "View" : "Edit"}
                            </button>
                          </CanDo>
                          {!isDeleted ? (
                            <>
                              <CanDo action="manageFees">
                                <button
                                  type="button"
                                  className="text-xs text-theme-accent hover:underline"
                                  onClick={() => setAssignStructure(row)}
                                >
                                  Assign
                                </button>
                              </CanDo>
                              <CanDo action="manageFees">
                                <button
                                  type="button"
                                  className="text-xs text-theme-danger hover:underline"
                                  onClick={() => setDeleteTarget(row)}
                                >
                                  Delete
                                </button>
                              </CanDo>
                            </>
                          ) : (
                            <CanDo action="manageFees">
                              <button
                                type="button"
                                className="text-xs text-theme-accent hover:underline"
                                onClick={() => void handleRestore(row)}
                              >
                                Restore
                              </button>
                            </CanDo>
                          )}
                          <Link href={`${base}/payments`} className="text-xs text-theme-muted hover:underline">
                            Payments
                          </Link>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              noun="structures"
            />
            </div>
          )}
        </QueryState>
      </DataListPanel>

      <AddFeeStructurePanel
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => void mutate()}
        onAssign={(structure) => {
          setAddOpen(false);
          setAssignStructure(structure);
        }}
      />
      <EditFeeStructurePanel
        structureId={editId}
        open={Boolean(editId)}
        onClose={() => setEditId(null)}
        onSaved={() => void mutate()}
        onAssign={(structure) => {
          setEditId(null);
          setAssignStructure(structure);
        }}
      />
      <AssignFeeStructureDialog
        structure={assignStructure}
        onClose={() => setAssignStructure(null)}
        onAssigned={() => void mutate()}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
        title="Delete fee structure?"
        description={
          deleteTarget
            ? `Soft-delete ${deleteTarget.class_name} · ${deleteTarget.term_name} ${deleteTarget.academic_year}? Existing invoices and payments are kept. You can restore later.`
            : ""
        }
        confirmLabel="Delete"
        loading={deleting}
        variant="danger"
      />
    </FeesPageShell>
  );
}
