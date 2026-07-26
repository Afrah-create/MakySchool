"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@makyschool/ui/components/ui/Modal";
import { PdfDownloadButton } from "@/components/fees/PdfDownloadButton";
import { apiClient } from "@/lib/api/client";
import { formatUGX, formatUGXInput, parseUGXInput } from "@/lib/formatCurrency";
import {
  paymentMethodLabel,
  type InvoiceDetail,
  type InvoiceItem,
  type PaymentMethod,
} from "@/lib/fees/types";
import { useToast } from "@/providers/ToastProvider";

type PayResponse = {
  payment: {
    id: string;
    receipt_number: string;
    amount: number;
    allocations?: Array<{ invoice_item_id: string; amount: number; description?: string }>;
  };
  invoice: InvoiceDetail;
};

type AllocationDraft = {
  invoice_item_id: string;
  description: string;
  balance: number;
  amount: number;
  selected: boolean;
};

function itemBalance(item: InvoiceItem) {
  if (typeof item.balance === "number") return item.balance;
  if (typeof item.amount_paid === "number") return Math.max(item.total_amount - item.amount_paid, 0);
  return item.total_amount;
}

export function RecordInvoicePaymentPanel({
  open,
  invoice,
  onClose,
  onPaid,
}: {
  open: boolean;
  invoice: InvoiceDetail | null;
  onClose: () => void;
  onPaid: () => void;
}) {
  const { toast } = useToast();
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<PayResponse | null>(null);
  const [drafts, setDrafts] = useState<AllocationDraft[]>([]);

  useEffect(() => {
    if (!invoice || !open) return;
    setSuccess(null);
    setError(null);
    const outstanding = (invoice.items ?? [])
      .filter((item) => item.id && itemBalance(item) > 0)
      .map((item) => ({
        invoice_item_id: item.id!,
        description: item.description,
        balance: itemBalance(item),
        amount: itemBalance(item),
        selected: true,
      }));
    setDrafts(
      outstanding.length > 0
        ? outstanding
        : [
            {
              invoice_item_id: "",
              description: "Invoice balance",
              balance: invoice.balance,
              amount: invoice.balance,
              selected: true,
            },
          ],
    );
  }, [invoice, open]);

  const total = useMemo(
    () => drafts.filter((d) => d.selected).reduce((sum, d) => sum + (d.amount > 0 ? d.amount : 0), 0),
    [drafts],
  );

  if (!invoice) return null;

  function updateDraft(id: string, patch: Partial<AllocationDraft>) {
    setDrafts((prev) => prev.map((row) => (row.invoice_item_id === id ? { ...row, ...patch } : row)));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const selected = drafts.filter((d) => d.selected && d.amount > 0);
    if (selected.length === 0) {
      setError("Select at least one fee category and enter an amount.");
      return;
    }
    for (const row of selected) {
      if (row.amount > row.balance) {
        setError(`Amount for “${row.description}” exceeds its outstanding balance.`);
        return;
      }
    }
    if (total <= 0 || total > invoice!.balance) {
      setError(`Enter a total up to ${formatUGX(invoice!.balance)}.`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const hasItemIds = selected.every((row) => row.invoice_item_id);
      const response = await apiClient<PayResponse>(`/schools/fees/invoices/${invoice!.id}/pay`, {
        method: "POST",
        body: {
          amount: total,
          payment_method: method,
          payment_reference: reference.trim() || undefined,
          payment_date: paymentDate,
          notes: notes.trim() || undefined,
          allocations: hasItemIds
            ? selected.map((row) => ({
                invoice_item_id: row.invoice_item_id,
                amount: row.amount,
              }))
            : undefined,
        },
      });
      setSuccess(response.data);
      toast.success(
        `Payment ${response.data.payment.receipt_number} recorded. Invoice balance: ${formatUGX(response.data.invoice.balance)}.`,
      );
      onPaid();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setSuccess(null);
        onClose();
      }}
      size="lg"
      title="Record invoice payment"
      description={`${invoice.invoice_number} — ${invoice.student_name}`}
      footer={
        success ? (
          <button type="button" className="ms-btn-primary w-full" onClick={onClose}>
            Close
          </button>
        ) : (
          <button type="submit" form="record-invoice-payment-form" disabled={loading} className="ms-btn-primary w-full">
            {loading ? "Recording…" : `Record ${formatUGX(total)}`}
          </button>
        )
      }
    >
      {success ? (
        <div className="space-y-4 text-sm">
          <p className="font-medium text-theme-primary">Receipt {success.payment.receipt_number}</p>
          <p className="text-theme-muted">
            {formatUGX(success.payment.amount)} applied. Invoice balance:{" "}
            {formatUGX(success.invoice.balance)} ({success.invoice.status})
          </p>
          {(success.payment.allocations?.length ?? 0) > 0 ? (
            <ul className="space-y-1 rounded-lg border border-theme p-3">
              {success.payment.allocations!.map((row) => (
                <li key={row.invoice_item_id} className="flex justify-between gap-3">
                  <span className="text-theme-muted">{row.description ?? "Item"}</span>
                  <span className="tabular-nums">{formatUGX(row.amount)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <PdfDownloadButton
            path={`/schools/fees/receipts/${success.payment.id}`}
            label="Download receipt PDF"
            className="ms-btn-secondary w-full text-sm"
          />
        </div>
      ) : (
        <form id="record-invoice-payment-form" onSubmit={(e) => void submit(e)} className="space-y-4">
          <p className="text-sm text-theme-muted">
            Invoice outstanding:{" "}
            <span className="font-semibold text-theme-primary">{formatUGX(invoice.balance)}</span>
          </p>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-theme-primary">Fee categories</span>
              <button
                type="button"
                className="text-xs text-theme-accent hover:underline"
                onClick={() =>
                  setDrafts((prev) =>
                    prev.map((row) => ({ ...row, selected: true, amount: row.balance })),
                  )
                }
              >
                Pay all outstanding
              </button>
            </div>
            {drafts.map((row) => (
              <div key={row.invoice_item_id || row.description} className="rounded-lg border border-theme p-3">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={row.selected}
                    onChange={(e) =>
                      updateDraft(row.invoice_item_id, {
                        selected: e.target.checked,
                        amount: e.target.checked ? row.balance : 0,
                      })
                    }
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-theme-primary">{row.description}</span>
                      <span className="text-xs text-theme-muted">
                        Outstanding {formatUGX(row.balance)}
                      </span>
                    </div>
                    {row.selected ? (
                      <div className="flex overflow-hidden rounded-xl border border-theme">
                        <span className="flex items-center bg-theme-surface-raised px-3 text-sm text-theme-muted">
                          UGX
                        </span>
                        <input
                          className="ms-input w-full border-0"
                          value={formatUGXInput(row.amount)}
                          onChange={(e) =>
                            updateDraft(row.invoice_item_id, {
                              amount: Math.min(parseUGXInput(e.target.value), row.balance),
                            })
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                </label>
              </div>
            ))}
            <p className="text-right text-sm font-medium text-theme-primary">Total: {formatUGX(total)}</p>
          </div>

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
          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Payment date</span>
            <input type="date" className="ms-input w-full" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Notes</span>
            <textarea className="ms-input w-full" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {error ? <p className="text-sm text-theme-danger">{error}</p> : null}
        </form>
      )}
    </Modal>
  );
}
