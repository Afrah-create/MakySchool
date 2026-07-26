"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { getFeeStructure } from "@/lib/api/fees";
import { apiClient } from "@/lib/api/client";
import { formatUGX } from "@/lib/formatCurrency";
import type { FeeStructure, FeeStructureDetail, FeeStructureItem } from "@/lib/fees/types";
import { useToast } from "@/providers/ToastProvider";

type AssignResult = {
  assigned: number;
  already_had_account: number;
  total_students: number;
  invoices_created: number;
};

export function AssignFeeStructureDialog({
  structure,
  onClose,
  onAssigned,
}: {
  structure: FeeStructure | FeeStructureDetail | null;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [result, setResult] = useState<AssignResult | null>(null);
  const [items, setItems] = useState<FeeStructureItem[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!structure) {
      setItems([]);
      setTotal(0);
      setResult(null);
      return;
    }

    if ("items" in structure && Array.isArray(structure.items) && structure.items.length > 0) {
      setItems(structure.items);
      setTotal(Number(structure.amount));
      return;
    }

    setDetailLoading(true);
    void getFeeStructure(structure.id)
      .then((detail) => {
        setItems(detail.items ?? []);
        setTotal(Number(detail.amount));
      })
      .catch(() => {
        setItems([]);
        setTotal(Number(structure.amount));
      })
      .finally(() => setDetailLoading(false));
  }, [structure]);

  if (!structure) return null;

  async function confirm() {
    setLoading(true);
    try {
      const response = await apiClient<AssignResult>(
        `/schools/fees/structures/${structure!.id}/assign`,
        { method: "POST" },
      );
      setResult(response.data);
      const invoices = response.data.invoices_created ?? 0;
      toast.success(
        invoices > 0
          ? `Assigned fees and created ${invoices} invoice${invoices === 1 ? "" : "s"}.`
          : `Fee accounts created for ${response.data.assigned} students.`,
      );
      onAssigned();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign fee structure.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-theme-overlay p-4">
      <div className="w-full max-w-md rounded-xl border border-theme bg-theme-surface p-6 shadow-theme-panel">
        {result ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-theme-primary">Assignment complete</h2>
            <ul className="space-y-2 text-sm text-theme-muted">
              <li>
                Fee accounts created for <span className="font-medium text-theme-primary">{result.assigned}</span>{" "}
                students.
              </li>
              {result.already_had_account > 0 ? (
                <li>
                  <span className="font-medium text-theme-primary">{result.already_had_account}</span> students
                  already had accounts.
                </li>
              ) : null}
              <li>
                Invoices generated:{" "}
                <span className="font-medium text-theme-primary">{result.invoices_created ?? 0}</span>
              </li>
            </ul>
            <button type="button" className="ms-btn-primary w-full" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-theme-primary">Assign fee structure</h2>
            <p className="text-sm text-theme-muted">
              Assign {structure.term_name} fees to all active students in {structure.class_name}? This creates
              a fee account and an invoice for each student who does not already have one.
            </p>

            <div className="rounded-lg border border-theme p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-theme-muted">
                Invoice line items
              </p>
              {detailLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : items.length > 0 ? (
                <ul className="space-y-1.5 text-sm">
                  {items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-3">
                      <span className="text-theme-muted">{item.description}</span>
                      <span className="tabular-nums text-theme-primary">{formatUGX(item.amount)}</span>
                    </li>
                  ))}
                  <li className="flex justify-between gap-3 border-t border-theme pt-2 font-medium">
                    <span>Total</span>
                    <span className="tabular-nums">{formatUGX(total || items.reduce((s, i) => s + i.amount, 0))}</span>
                  </li>
                </ul>
              ) : (
                <p className="text-sm text-theme-muted">
                  Total: {formatUGX(Number(structure.amount))}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button type="button" className="ms-btn-secondary flex-1" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="ms-btn-primary flex-1" disabled={loading} onClick={() => void confirm()}>
                {loading ? "Assigning…" : `Assign to ${structure.student_count || "class"} students`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
