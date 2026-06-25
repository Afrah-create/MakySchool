"use client";

import { useMemo, useState } from "react";
import { Modal } from "@makyschool/ui/components/ui/Modal";
import { useApiSWR } from "@/hooks/useApiSWR";
import { apiClient } from "@/lib/api/client";
import { formatUGX, formatUGXInput, parseUGXInput } from "@/lib/formatCurrency";
import {
  paymentMethodLabel,
  type ChartAccount,
  type IncomeSource,
  type OtherIncomeRecord,
  type PaymentMethod,
} from "@/lib/fees/types";
import { useToast } from "@/providers/ToastProvider";

type LineItem = { description: string; account_id: string; amount: number };

export function AddOtherIncomePanel({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const { data: sourcesData } = useApiSWR<{ sources: IncomeSource[] }>(open ? "/schools/fees/income-sources" : null);
  const { data: accountsData } = useApiSWR<{ accounts: ChartAccount[] }>(
    open ? "/schools/fees/accounts?account_type=income" : null,
  );

  const sources = sourcesData?.sources?.filter((s) => s.is_active) ?? [];
  const accounts = accountsData?.accounts?.filter((a) => a.is_active) ?? [];

  const [sourceId, setSourceId] = useState("");
  const [description, setDescription] = useState("");
  const [incomeDate, setIncomeDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ description: "", account_id: "", amount: 0 }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(() => items.reduce((sum, item) => sum + (item.amount || 0), 0), [items]);

  function reset() {
    setSourceId("");
    setDescription("");
    setIncomeDate(new Date().toISOString().slice(0, 10));
    setMethod("cash");
    setReference("");
    setNotes("");
    setItems([{ description: "", account_id: "", amount: 0 }]);
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const validItems = items.filter((item) => item.description.trim() && item.amount > 0);
    if (validItems.length === 0) {
      setError("Add at least one line item with a description and amount.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient<OtherIncomeRecord>("/schools/fees/other-income", {
        method: "POST",
        body: {
          source_id: sourceId || undefined,
          description: description.trim(),
          income_date: incomeDate,
          payment_method: method,
          payment_reference: reference.trim() || undefined,
          notes: notes.trim() || undefined,
          items: validItems.map((item) => ({
            description: item.description.trim(),
            account_id: item.account_id || undefined,
            amount: item.amount,
          })),
        },
      });
      toast.success(`Income ${response.data.reference_number} recorded (${formatUGX(response.data.total_amount)}).`);
      reset();
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record income.");
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
      size="lg"
      title="Record other income"
      description="Capture non-fee income with line items."
      footer={
        <button type="submit" form="add-other-income-form" disabled={loading} className="ms-btn-primary w-full">
          {loading ? "Saving…" : `Record ${formatUGX(total)}`}
        </button>
      }
    >
      <form id="add-other-income-form" onSubmit={(e) => void submit(e)} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs text-theme-muted">Income source</span>
          <select className="ms-input w-full" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            <option value="">None</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-theme-muted">Description *</span>
          <input className="ms-input w-full" value={description} onChange={(e) => setDescription(e.target.value)} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-theme-muted">Income date *</span>
          <input type="date" className="ms-input w-full" value={incomeDate} onChange={(e) => setIncomeDate(e.target.value)} required />
        </label>
        <fieldset className="space-y-2">
          <legend className="text-xs text-theme-muted">Payment method</legend>
          {(["cash", "bank_transfer", "mobile_money", "cheque", "other"] as const).map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input type="radio" checked={method === value} onChange={() => setMethod(value)} />
              {paymentMethodLabel(value)}
            </label>
          ))}
        </fieldset>
        {method !== "cash" ? (
          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Reference</span>
            <input className="ms-input w-full" value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
        ) : null}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-theme-primary">Line items</span>
            <button
              type="button"
              className="text-xs text-theme-accent hover:underline"
              onClick={() => setItems((prev) => [...prev, { description: "", account_id: "", amount: 0 }])}
            >
              Add line
            </button>
          </div>
          {items.map((item, index) => (
            <div key={index} className="space-y-2 rounded-lg border border-theme p-3">
              <input
                className="ms-input w-full"
                placeholder="Description"
                value={item.description}
                onChange={(e) => {
                  const next = [...items];
                  next[index] = { ...next[index], description: e.target.value };
                  setItems(next);
                }}
              />
              <select
                className="ms-input w-full"
                value={item.account_id}
                onChange={(e) => {
                  const next = [...items];
                  next[index] = { ...next[index], account_id: e.target.value };
                  setItems(next);
                }}
              >
                <option value="">No account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} — {account.name}
                  </option>
                ))}
              </select>
              <input
                className="ms-input w-full"
                placeholder="Amount"
                value={formatUGXInput(item.amount)}
                onChange={(e) => {
                  const next = [...items];
                  next[index] = { ...next[index], amount: parseUGXInput(e.target.value) };
                  setItems(next);
                }}
              />
            </div>
          ))}
          <p className="text-right text-sm font-medium text-theme-primary">Total: {formatUGX(total)}</p>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-theme-muted">Notes</span>
          <textarea className="ms-input w-full" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error ? <p className="text-sm text-theme-danger">{error}</p> : null}
      </form>
    </Modal>
  );
}
