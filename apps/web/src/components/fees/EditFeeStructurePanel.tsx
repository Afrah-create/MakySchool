"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Modal } from "@makyschool/ui/components/ui/Modal";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { useApiSWR } from "@/hooks/useApiSWR";
import {
  addFeeStructureItem,
  addFeeStructureItemsBulk,
  deleteFeeStructureItem,
  getFeeStructure,
  reorderFeeStructureItems,
  updateFeeStructureHeader,
  updateFeeStructureItem,
} from "@/lib/api/fees";
import { formatUGX, formatUGXInput, parseUGXInput } from "@/lib/formatCurrency";
import type { ChartAccount, FeeStructureDetail, FeeStructureItem } from "@/lib/fees/types";
import { useToast } from "@/providers/ToastProvider";

type DraftBulkItem = {
  key: string;
  description: string;
  amount: number;
  account_id: string;
};

export function EditFeeStructurePanel({
  structureId,
  open,
  onClose,
  onSaved,
  onAssign,
}: {
  structureId: string | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onAssign?: (structure: FeeStructureDetail) => void;
}) {
  const { toast } = useToast();
  const { data: accountsData } = useApiSWR<{ accounts: ChartAccount[] }>(
    open ? "/schools/fees/accounts?account_type=income" : null,
  );
  const accounts = accountsData?.accounts?.filter((a) => a.is_active) ?? [];

  const [detail, setDetail] = useState<FeeStructureDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingHeader, setSavingHeader] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkItems, setBulkItems] = useState<DraftBulkItem[]>([
    { key: crypto.randomUUID(), description: "", amount: 0, account_id: "" },
  ]);
  const [bulkLoading, setBulkLoading] = useState(false);

  const locked = Boolean(detail?.locked);
  const deleted = Boolean(detail?.deleted || detail?.deleted_at);
  const readOnly = locked || deleted;

  async function reload() {
    if (!structureId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getFeeStructure(structureId);
      setDetail(data);
      setDescription(data.description ?? "");
      setIsActive(Boolean(data.is_active));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load fee structure.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && structureId) {
      void reload();
    }
    if (!open) {
      setDetail(null);
      setError(null);
      setBulkOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on open/id only
  }, [open, structureId]);

  const total = useMemo(
    () => (detail?.items ?? []).reduce((sum, item) => sum + Number(item.amount), 0),
    [detail?.items],
  );

  async function saveHeader() {
    if (!structureId || !detail) return;
    setSavingHeader(true);
    try {
      await updateFeeStructureHeader(structureId, {
        description: description.trim() || null,
        is_active: isActive,
      });
      toast.success("Structure updated.");
      await reload();
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update structure.");
    } finally {
      setSavingHeader(false);
    }
  }

  async function patchItem(item: FeeStructureItem, patch: Partial<FeeStructureItem>) {
    if (!structureId || readOnly) return;
    try {
      await updateFeeStructureItem(structureId, item.id, {
        description: patch.description,
        amount: patch.amount,
        account_id: patch.account_id,
        sort_order: patch.sort_order,
      });
      await reload();
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update item.");
      await reload();
    }
  }

  async function removeItem(itemId: string) {
    if (!structureId || readOnly) return;
    try {
      await deleteFeeStructureItem(structureId, itemId);
      toast.success("Item deleted.");
      await reload();
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete item.");
    }
  }

  async function addBlankItem() {
    if (!structureId || readOnly) return;
    try {
      await addFeeStructureItem(structureId, {
        description: "New fee item",
        amount: 1,
        sort_order: detail?.items.length ?? 0,
      });
      await reload();
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add item.");
    }
  }

  async function moveItem(itemId: string, direction: -1 | 1) {
    if (!structureId || !detail || readOnly) return;
    const ids = detail.items.map((item) => item.id);
    const index = ids.indexOf(itemId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return;
    const next = [...ids];
    const [moved] = next.splice(index, 1);
    next.splice(nextIndex, 0, moved);
    try {
      await reorderFeeStructureItems(structureId, { item_ids: next });
      await reload();
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reorder items.");
    }
  }

  async function submitBulk() {
    if (!structureId || readOnly) return;
    const valid = bulkItems.filter((item) => item.description.trim() && item.amount > 0);
    if (valid.length === 0) {
      toast.error("Add at least one item with description and amount.");
      return;
    }
    setBulkLoading(true);
    try {
      await addFeeStructureItemsBulk(structureId, {
        items: valid.map((item, index) => ({
          description: item.description.trim(),
          amount: item.amount,
          account_id: item.account_id || undefined,
          sort_order: (detail?.items.length ?? 0) + index,
        })),
      });
      toast.success(`${valid.length} item(s) added.`);
      setBulkOpen(false);
      setBulkItems([{ key: crypto.randomUUID(), description: "", amount: 0, account_id: "" }]);
      await reload();
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add items.");
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Edit fee structure"
      description={
        detail
          ? `${detail.class_name} · ${detail.term_name} ${detail.academic_year}`
          : "Load structure details and line items."
      }
      footer={
        <div className="flex flex-wrap gap-2">
          <button type="button" className="ms-btn-secondary flex-1" onClick={onClose}>
            Close
          </button>
          {detail && !deleted ? (
            <button
              type="button"
              className="ms-btn-primary flex-1"
              onClick={() => onAssign?.(detail)}
            >
              Assign to class
            </button>
          ) : null}
        </div>
      }
    >
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : error ? (
        <p className="text-sm text-theme-danger">{error}</p>
      ) : detail ? (
        <div className="space-y-5">
          {deleted ? (
            <div className="rounded-lg border border-theme bg-theme-surface-raised px-3 py-2 text-sm text-theme-muted">
              This structure is deleted. Restore it from the structures list before editing or assigning.
            </div>
          ) : null}
          {locked && !deleted ? (
            <div className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
              This structure is locked. Invoices have been generated and no changes can be made to fee
              items.
            </div>
          ) : null}

          <div className="space-y-3 rounded-lg border border-theme p-3">
            <label className="block">
              <span className="mb-1 block text-xs text-theme-muted">Description</span>
              <textarea
                className="ms-input w-full"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={deleted}
              />
            </label>
            {!readOnly ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                Active
              </label>
            ) : null}
            {!deleted ? (
              <button
                type="button"
                className="ms-btn-secondary"
                disabled={savingHeader}
                onClick={() => void saveHeader()}
              >
                {savingHeader ? "Saving…" : "Save header"}
              </button>
            ) : null}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-theme-primary">
                Fee items · Total {formatUGX(total)}
              </span>
              {!readOnly ? (
                <div className="flex gap-3">
                  <button
                    type="button"
                    className="text-xs text-theme-accent hover:underline"
                    onClick={() => setBulkOpen(true)}
                  >
                    Add items in bulk
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs text-theme-accent hover:underline"
                    onClick={() => void addBlankItem()}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add item
                  </button>
                </div>
              ) : null}
            </div>

            {detail.items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-theme p-6 text-center text-sm text-theme-muted">
                <p>No fee items yet.</p>
                {!readOnly ? (
                  <button
                    type="button"
                    className="ms-btn-primary mt-3"
                    onClick={() => void addBlankItem()}
                  >
                    Add first item
                  </button>
                ) : null}
              </div>
            ) : (
              detail.items.map((item, index) => (
                <div key={item.id} className="space-y-2 rounded-lg border border-theme p-3">
                  {readOnly ? (
                    <div className="flex justify-between gap-3 text-sm">
                      <div>
                        <p className="font-medium text-theme-primary">{item.description}</p>
                        <p className="text-theme-muted">
                          {item.account_code ? `${item.account_code} · ${item.account_name}` : "No account"}
                        </p>
                      </div>
                      <p className="tabular-nums font-medium">{formatUGX(item.amount)}</p>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col gap-1 pt-1">
                        <button
                          type="button"
                          className="rounded p-0.5 text-theme-muted hover:bg-nav-hover disabled:opacity-30"
                          disabled={index === 0}
                          onClick={() => void moveItem(item.id, -1)}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="rounded p-0.5 text-theme-muted hover:bg-nav-hover disabled:opacity-30"
                          disabled={index === detail.items.length - 1}
                          onClick={() => void moveItem(item.id, 1)}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <input
                          className="ms-input w-full"
                          defaultValue={item.description}
                          onBlur={(e) => {
                            const next = e.target.value.trim();
                            if (next && next !== item.description) {
                              void patchItem(item, { description: next });
                            }
                          }}
                        />
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="flex overflow-hidden rounded-xl border border-theme">
                            <span className="flex items-center bg-theme-surface-raised px-3 text-sm text-theme-muted">
                              UGX
                            </span>
                            <input
                              className="ms-input w-full border-0"
                              defaultValue={formatUGXInput(item.amount)}
                              onBlur={(e) => {
                                const next = parseUGXInput(e.target.value);
                                if (next > 0 && next !== item.amount) {
                                  void patchItem(item, { amount: next });
                                }
                              }}
                            />
                          </div>
                          <select
                            className="ms-input w-full"
                            defaultValue={item.account_id ?? ""}
                            onChange={(e) => {
                              void patchItem(item, { account_id: e.target.value || null });
                            }}
                          >
                            <option value="">No account</option>
                            {accounts.map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.code} — {account.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded p-1.5 text-theme-muted hover:bg-nav-hover hover:text-theme-danger disabled:opacity-30"
                        disabled={detail.items.length <= 1}
                        onClick={() => void removeItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {bulkOpen ? (
            <div className="space-y-3 rounded-lg border border-theme p-3">
              <p className="text-sm font-medium text-theme-primary">Add items in bulk</p>
              {bulkItems.map((item) => (
                <div key={item.key} className="grid gap-2 sm:grid-cols-2">
                  <input
                    className="ms-input w-full"
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) =>
                      setBulkItems((prev) =>
                        prev.map((row) =>
                          row.key === item.key ? { ...row, description: e.target.value } : row,
                        ),
                      )
                    }
                  />
                  <input
                    className="ms-input w-full"
                    placeholder="Amount"
                    value={formatUGXInput(item.amount)}
                    onChange={(e) =>
                      setBulkItems((prev) =>
                        prev.map((row) =>
                          row.key === item.key
                            ? { ...row, amount: parseUGXInput(e.target.value) }
                            : row,
                        ),
                      )
                    }
                  />
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="text-xs text-theme-accent hover:underline"
                  onClick={() =>
                    setBulkItems((prev) => [
                      ...prev,
                      { key: crypto.randomUUID(), description: "", amount: 0, account_id: "" },
                    ])
                  }
                >
                  Add row
                </button>
                <button
                  type="button"
                  className="ms-btn-secondary"
                  onClick={() => setBulkOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="ms-btn-primary"
                  disabled={bulkLoading}
                  onClick={() => void submitBulk()}
                >
                  {bulkLoading ? "Saving…" : "Save items"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
