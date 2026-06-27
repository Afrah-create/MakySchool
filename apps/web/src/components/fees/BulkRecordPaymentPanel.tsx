"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { FeeStatusBadge } from "@/components/fees/FeeStatusBadge";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { apiClient } from "@/lib/api/client";
import { formatUGX, formatUGXInput, parseUGXInput } from "@/lib/formatCurrency";
import type { BulkRecordPaymentResult, OutstandingStudent, PaymentMethod } from "@/lib/fees/types";
import { paymentMethodLabel } from "@/lib/fees/types";

type BulkLine = {
  student: OutstandingStudent;
  amount: number;
};

export function BulkRecordPaymentPanel({
  students,
  onClose,
  onSuccess,
}: {
  students: OutstandingStudent[];
  onClose: () => void;
  onSuccess: (result: BulkRecordPaymentResult) => void;
}) {
  const [lines, setLines] = useState<BulkLine[]>(() =>
    students.map((student) => ({ student, amount: student.balance })),
  );
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(() => lines.reduce((sum, line) => sum + line.amount, 0), [lines]);

  function setLineAmount(accountId: string, amount: number) {
    setLines((current) =>
      current.map((line) =>
        line.student.account_id === accountId ? { ...line, amount } : line,
      ),
    );
  }

  function fillFullBalances() {
    setLines((current) => current.map((line) => ({ ...line, amount: line.student.balance })));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const invalid = lines.find(
      (line) => line.amount <= 0 || line.amount > line.student.balance,
    );
    if (invalid) {
      setError(`Check amounts for ${invalid.student.full_name}.`);
      return;
    }

    const missingStructure = lines.filter((line) => !line.student.fee_structure_id?.trim());
    if (missingStructure.length > 0) {
      setError(
        `Missing fee structure for ${missingStructure[0].student.full_name}. Refresh the page and try again.`,
      );
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await apiClient<BulkRecordPaymentResult>("/schools/fees/payments/bulk", {
        method: "POST",
        body: {
          payments: lines.map((line) => ({
            student_id: line.student.student_id,
            fee_structure_id: line.student.fee_structure_id,
            amount: line.amount,
          })),
          payment_method: method,
          payment_reference: reference.trim() || undefined,
          payment_date: paymentDate,
          notes: notes.trim() || undefined,
        },
      });
      onSuccess(response.data);
    } catch (err) {
      const apiError = err as Error & {
        code?: string;
        failed?: Array<{ error: string; student_id?: string }>;
      };
      if (apiError.code === "BULK_PAYMENT_FAILED" && apiError.failed?.length) {
        setError(apiError.failed.map((item) => item.error).join(" "));
      } else {
        setError(apiError.message || "Bulk payment failed.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-theme bg-theme-surface shadow-xl"
        role="dialog"
        aria-labelledby="bulk-payment-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-theme px-5 py-4">
          <div>
            <h2 id="bulk-payment-title" className="text-lg font-semibold text-theme-primary">
              Record bulk payments
            </h2>
            <p className="mt-0.5 text-sm text-theme-muted">
              {lines.length} student{lines.length === 1 ? "" : "s"} · Total {formatUGX(total)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-theme-muted hover:bg-nav-hover"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void submit(e)} className="flex min-h-0 flex-1 flex-col">
          <div className="dashboard-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
            <div className="flex flex-wrap gap-2">
              <button type="button" className="ms-btn-secondary text-xs" onClick={fillFullBalances}>
                Fill full balances
              </button>
            </div>

            {lines.map((line) => (
              <div
                key={line.student.account_id}
                className="rounded-xl border border-theme bg-theme-page p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-theme-primary">{line.student.full_name}</p>
                    <p className="text-xs text-theme-muted">
                      {line.student.learner_id} · {line.student.class_name} · {line.student.term_name}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <FeeStatusBadge status={line.student.status} />
                      <span className="text-xs text-theme-muted">
                        Balance {formatUGX(line.student.balance)}
                      </span>
                    </div>
                  </div>
                  <label className="w-full min-w-[8rem] sm:w-36">
                    <span className="mb-1 block text-xs text-theme-muted">Amount (UGX)</span>
                    <input
                      className="ms-input w-full"
                      value={formatUGXInput(line.amount)}
                      onChange={(e) =>
                        setLineAmount(line.student.account_id, parseUGXInput(e.target.value))
                      }
                    />
                  </label>
                </div>
              </div>
            ))}

            <div className="grid gap-4 border-t border-theme pt-4 sm:grid-cols-2">
              <fieldset className="space-y-2 sm:col-span-2">
                <legend className="text-xs font-medium text-theme-muted">Payment method</legend>
                <div className="flex flex-wrap gap-2">
                  {(["cash", "bank_transfer", "mobile_money", "cheque", "other"] as const).map(
                    (value) => (
                      <label
                        key={value}
                        className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          method === value
                            ? "border-theme-accent bg-theme-accent-muted text-theme-accent"
                            : "border-theme text-theme-muted hover:border-accent-soft"
                        }`}
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          checked={method === value}
                          onChange={() => setMethod(value)}
                        />
                        {paymentMethodLabel(value)}
                      </label>
                    ),
                  )}
                </div>
              </fieldset>

              {method !== "cash" ? (
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs text-theme-muted">Reference</span>
                  <input
                    className="ms-input w-full"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </label>
              ) : null}

              <label className="block">
                <span className="mb-1 block text-xs text-theme-muted">Payment date</span>
                <input
                  type="date"
                  className="ms-input w-full"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs text-theme-muted">Notes (optional)</span>
                <textarea
                  className="ms-input w-full"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </div>

            {error ? <p className="text-sm text-theme-danger">{error}</p> : null}
          </div>

          <div className="flex gap-2 border-t border-theme px-5 py-4">
            <button type="button" className="ms-btn-secondary flex-1" onClick={onClose}>
              Cancel
            </button>
            <LoadingButton type="submit" className="ms-btn-primary flex-1" loading={loading}>
              Record {lines.length} payment{lines.length === 1 ? "" : "s"}
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
}

export function RecordPaymentSuccessBanner({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-theme bg-theme-success-bg p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-theme-success-text/15 text-theme-success-text">
          <CheckCircle2 className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-theme-primary">{title}</h2>
          <p className="mt-1 text-sm text-theme-muted">{description}</p>
          {children ? <div className="mt-5 space-y-4">{children}</div> : null}
        </div>
      </div>
    </div>
  );
}
