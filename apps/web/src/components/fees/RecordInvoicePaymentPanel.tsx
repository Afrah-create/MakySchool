"use client";

import { useEffect, useState } from "react";
import { Modal } from "@makyschool/ui/components/ui/Modal";
import { PdfDownloadButton } from "@/components/fees/PdfDownloadButton";
import { apiClient } from "@/lib/api/client";
import { formatUGX, formatUGXInput, parseUGXInput } from "@/lib/formatCurrency";
import { paymentMethodLabel, type InvoiceDetail, type PaymentMethod } from "@/lib/fees/types";
import { useToast } from "@/providers/ToastProvider";

type PayResponse = {
  payment: { id: string; receipt_number: string; amount: number };
  invoice: { invoice_number: string; amount_paid: number; balance: number; status: string };
};

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
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<PayResponse | null>(null);

  useEffect(() => {
    if (invoice && open) {
      setAmount(invoice.balance);
      setSuccess(null);
      setError(null);
    }
  }, [invoice, open]);

  if (!invoice) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (amount <= 0 || amount > invoice!.balance) {
      setError(`Enter an amount up to ${formatUGX(invoice!.balance)}.`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient<PayResponse>(`/schools/fees/invoices/${invoice!.id}/pay`, {
        method: "POST",
        body: {
          amount,
          payment_method: method,
          payment_reference: reference.trim() || undefined,
          payment_date: paymentDate,
          notes: notes.trim() || undefined,
        },
      });
      setSuccess(response.data);
      toast.success(
        `Payment ${response.data.payment.receipt_number} recorded for invoice ${response.data.invoice.invoice_number}. Balance: ${formatUGX(response.data.invoice.balance)}.`,
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
      size="md"
      title="Record invoice payment"
      description={`${invoice.invoice_number} — ${invoice.student_name}`}
      footer={
        success ? (
          <button type="button" className="ms-btn-primary w-full" onClick={onClose}>
            Close
          </button>
        ) : (
          <button type="submit" form="record-invoice-payment-form" disabled={loading} className="ms-btn-primary w-full">
            {loading ? "Recording…" : "Record payment"}
          </button>
        )
      }
    >
      {success ? (
        <div className="space-y-4 text-sm">
          <p className="font-medium text-theme-primary">Receipt {success.payment.receipt_number}</p>
          <p className="text-theme-muted">
            {formatUGX(success.payment.amount)} applied. Balance: {formatUGX(success.invoice.balance)}
          </p>
          <PdfDownloadButton
            path={`/schools/fees/receipts/${success.payment.id}`}
            label="Download receipt PDF"
            className="ms-btn-secondary w-full text-sm"
          />
        </div>
      ) : (
        <form id="record-invoice-payment-form" onSubmit={(e) => void submit(e)} className="space-y-4">
          <p className="text-sm text-theme-muted">
            Outstanding balance: <span className="font-semibold text-theme-primary">{formatUGX(invoice.balance)}</span>
          </p>
          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Amount (UGX)</span>
            <input
              className="ms-input w-full"
              value={formatUGXInput(amount)}
              onChange={(e) => setAmount(parseUGXInput(e.target.value))}
            />
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
