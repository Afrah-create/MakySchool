"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Modal } from "@makyschool/ui/components/ui/Modal";
import { formatClassLabel } from "@makyschool/shared/constants";
import type { SchoolSettingsResponse } from "@makyschool/shared/types";
import { useApiSWR } from "@/hooks/useApiSWR";
import { createFeeStructure } from "@/lib/api/fees";
import { formatUGX, formatUGXInput, parseUGXInput } from "@/lib/formatCurrency";
import {
  FEE_STRUCTURE_PRESETS,
  type ChartAccount,
  type FeeStructureDetail,
} from "@/lib/fees/types";
import { useToast } from "@/providers/ToastProvider";

type ClassOption = { id: string; level: string; stream: string | null };

type DraftItem = {
  key: string;
  description: string;
  amount: number;
  account_id: string;
};

function newDraft(description = ""): DraftItem {
  return {
    key: crypto.randomUUID(),
    description,
    amount: 0,
    account_id: "",
  };
}

export function AddFeeStructurePanel({
  open,
  onClose,
  onSaved,
  onAssign,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onAssign?: (structure: FeeStructureDetail) => void;
}) {
  const { toast } = useToast();
  const { data: classes } = useApiSWR<ClassOption[]>(open ? "/schools/classes" : null);
  const { data: settings } = useApiSWR<SchoolSettingsResponse>(open ? "/schools/settings" : null);
  const { data: accountsData } = useApiSWR<{ accounts: ChartAccount[] }>(
    open ? "/schools/fees/accounts?account_type=income" : null,
  );

  const accounts = accountsData?.accounts?.filter((a) => a.is_active) ?? [];
  const terms = settings?.academic_year?.terms?.map((t) => t.name).filter(Boolean) ?? ["Term 1", "Term 2", "Term 3"];
  const currentYear = settings?.academic_year?.year ?? new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  const [classId, setClassId] = useState("");
  const [termName, setTermName] = useState(terms[0] ?? "Term 1");
  const [academicYear, setAcademicYear] = useState(currentYear);
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<DraftItem[]>([newDraft("Tuition")]);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<FeeStructureDetail | null>(null);
  const amountRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const total = useMemo(
    () => items.reduce((sum, item) => sum + (item.amount > 0 ? item.amount : 0), 0),
    [items],
  );

  function reset() {
    setClassId("");
    setTermName(terms[0] ?? "Term 1");
    setAcademicYear(currentYear);
    setDescription("");
    setItems([newDraft("Tuition")]);
    setRowErrors({});
    setError(null);
    setCreated(null);
  }

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function moveItem(key: string, direction: -1 | 1) {
    setItems((prev) => {
      const index = prev.findIndex((item) => item.key === key);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      const [row] = next.splice(index, 1);
      next.splice(nextIndex, 0, row);
      return next;
    });
  }

  function addPreset(label: string) {
    const draft = newDraft(label);
    setItems((prev) => [...prev, draft]);
    requestAnimationFrame(() => {
      amountRefs.current[draft.key]?.focus();
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    const validItems = items.filter((item) => {
      if (!item.description.trim()) {
        nextErrors[item.key] = "Description is required.";
        return false;
      }
      if (item.amount <= 0) {
        nextErrors[item.key] = "Amount must be greater than zero.";
        return false;
      }
      return true;
    });

    if (validItems.length === 0) {
      setRowErrors(nextErrors);
      setError("Add at least one fee item with a description and amount.");
      return;
    }
    if (Object.keys(nextErrors).length > 0) {
      setRowErrors(nextErrors);
      setError("Please fix the highlighted items.");
      return;
    }

    setLoading(true);
    setError(null);
    setRowErrors({});
    try {
      const response = await createFeeStructure({
        class_id: classId,
        term_name: termName.trim(),
        academic_year: academicYear,
        description: description.trim() || undefined,
        items: validItems.map((item, index) => ({
          description: item.description.trim(),
          amount: item.amount,
          account_id: item.account_id || undefined,
          sort_order: index,
        })),
      });
      setCreated(response);
      toast.success(`Fee structure created for ${formatUGX(response.amount)}.`);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create fee structure.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      size="xl"
      title="Add fee structure"
      description="Define the fee header and line items for a class and term."
      footer={
        created ? (
          <div className="flex gap-2">
            <button
              type="button"
              className="ms-btn-secondary flex-1"
              onClick={() => {
                reset();
                onClose();
              }}
            >
              Close
            </button>
            <button
              type="button"
              className="ms-btn-primary flex-1"
              onClick={() => onAssign?.(created)}
            >
              Assign to class
            </button>
          </div>
        ) : (
          <button type="submit" form="add-fee-structure-form" disabled={loading} className="ms-btn-primary w-full">
            {loading ? "Creating…" : `Create fee structure (${formatUGX(total)})`}
          </button>
        )
      }
    >
      {created ? (
        <div className="space-y-3 text-sm">
          <p className="font-medium text-theme-primary">Fee structure created</p>
          <p className="text-theme-muted">
            {created.class_name} · {created.term_name} · {formatUGX(Number(created.amount))}
          </p>
          <ul className="space-y-1 rounded-lg border border-theme p-3 text-theme-muted">
            {created.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span>{item.description}</span>
                <span className="tabular-nums text-theme-primary">{formatUGX(item.amount)}</span>
              </li>
            ))}
          </ul>
          <p className="text-theme-muted">Assign it to active students in the class to start collecting fees.</p>
        </div>
      ) : (
        <form id="add-fee-structure-form" onSubmit={(e) => void submit(e)} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-theme-muted">Class *</span>
              <select className="ms-input w-full" value={classId} onChange={(e) => setClassId(e.target.value)} required>
                <option value="">Select class</option>
                {(classes ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {formatClassLabel(item.level, item.stream)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-theme-muted">Term *</span>
              <select className="ms-input w-full" value={termName} onChange={(e) => setTermName(e.target.value)} required>
                {terms.map((term) => (
                  <option key={term} value={term}>
                    {term}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-theme-muted">Academic year *</span>
              <select
                className="ms-input w-full"
                value={academicYear}
                onChange={(e) => setAcademicYear(Number(e.target.value))}
                required
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-theme-muted">Description</span>
              <textarea
                className="ms-input w-full"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional header note for this structure"
              />
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-theme-primary">Fee items</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-theme-accent hover:underline"
                onClick={() => setItems((prev) => [...prev, newDraft()])}
              >
                <Plus className="h-3.5 w-3.5" />
                Add item
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {FEE_STRUCTURE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="rounded-full border border-theme px-2.5 py-1 text-xs text-theme-muted transition hover:border-theme-accent hover:text-theme-primary"
                  onClick={() => addPreset(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>

            {items.map((item, index) => (
              <div key={item.key} className="space-y-2 rounded-lg border border-theme p-3">
                <div className="flex items-start gap-2">
                  <div className="flex flex-col gap-1 pt-1">
                    <button
                      type="button"
                      className="rounded p-0.5 text-theme-muted hover:bg-nav-hover disabled:opacity-30"
                      disabled={index === 0}
                      onClick={() => moveItem(item.key, -1)}
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-0.5 text-theme-muted hover:bg-nav-hover disabled:opacity-30"
                      disabled={index === items.length - 1}
                      onClick={() => moveItem(item.key, 1)}
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <input
                      className="ms-input w-full"
                      placeholder="Description (e.g. Tuition)"
                      value={item.description}
                      onChange={(e) => updateItem(item.key, { description: e.target.value })}
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="flex overflow-hidden rounded-xl border border-theme">
                        <span className="flex items-center bg-theme-surface-raised px-3 text-sm text-theme-muted">
                          UGX
                        </span>
                        <input
                          ref={(el) => {
                            amountRefs.current[item.key] = el;
                          }}
                          className="ms-input w-full border-0"
                          value={formatUGXInput(item.amount)}
                          onChange={(e) => updateItem(item.key, { amount: parseUGXInput(e.target.value) })}
                        />
                      </div>
                      <select
                        className="ms-input w-full"
                        value={item.account_id}
                        onChange={(e) => updateItem(item.key, { account_id: e.target.value })}
                      >
                        <option value="">No account</option>
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.code} — {account.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {rowErrors[item.key] ? (
                      <p className="text-xs text-theme-danger">{rowErrors[item.key]}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="rounded p-1.5 text-theme-muted hover:bg-nav-hover hover:text-theme-danger disabled:opacity-30"
                    disabled={items.length <= 1}
                    onClick={() => setItems((prev) => prev.filter((row) => row.key !== item.key))}
                    aria-label="Remove item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}

            <p className="text-right text-sm font-medium text-theme-primary">Total: {formatUGX(total)}</p>
          </div>

          {error ? <p className="text-sm text-theme-danger">{error}</p> : null}
        </form>
      )}
    </Modal>
  );
}
