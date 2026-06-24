"use client";

import { useMemo, useState } from "react";
import { CanDo } from "@/components/ui/CanDo";
import { VoidPaymentDialog } from "@/components/fees/VoidPaymentDialog";
import { FeeStatusBadge } from "@/components/fees/FeeStatusBadge";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { useApiSWR } from "@/hooks/useApiSWR";
import { useFeesPortal } from "@/hooks/useFeesBasePath";
import { formatUGX } from "@/lib/formatCurrency";
import { paymentMethodLabel, type FeePayment } from "@/lib/fees/types";
import { resolveClientApiUrl } from "@/lib/api/base-url";

type PaymentsResponse = {
  payments: FeePayment[];
  total: number;
  page: number;
  limit: number;
};

export function PaymentsHistoryContent() {
  const isAdminPortal = useFeesPortal() === "admin";
  const [page, setPage] = useState(1);
  const [voidPayment, setVoidPayment] = useState<FeePayment | null>(null);
  const query = useMemo(() => `/schools/fees/payments?page=${page}&limit=25`, [page]);
  const { data, error, isLoading, mutate } = useApiSWR<PaymentsResponse>(query);

  function exportCsv() {
    const rows = data?.payments ?? [];
    const header = ["Receipt", "Student", "Class", "Term", "Amount", "Method", "Date", "Status"];
    const lines = rows.map((row) => [
      row.receipt_number,
      row.student_name,
      row.class_name ?? "",
      row.term_name ?? "",
      row.amount,
      row.payment_method,
      row.payment_date,
      row.voided ? "Voided" : "Active",
    ]);
    const csv = [header, ...lines].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "fee-payments.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-theme-primary">Payment history</h1>
          <p className="mt-1 text-sm text-theme-muted">
            {isAdminPortal
              ? "Read-only ledger of payments recorded by your bursar"
              : "All recorded fee payments"}
          </p>
        </div>
        <button type="button" className="ms-btn-secondary" onClick={exportCsv}>
          Export CSV
        </button>
      </div>

      <QueryState
        error={error}
        isLoading={isLoading}
        data={data}
        onRetry={() => void mutate()}
        loading={<Skeleton className="h-64" />}
        empty={<EmptyState title="No payments yet." description="Recorded payments will appear here." />}
        isEmpty={(payload) => payload.payments.length === 0}
      >
        {(payload) => (
          <>
            <div className="overflow-hidden rounded-xl border border-theme">
              <table className="ms-table w-full">
                <thead>
                  <tr>
                    <th>Receipt #</th>
                    <th>Student</th>
                    <th>Class</th>
                    <th>Term</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Date</th>
                    <th>Recorded by</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.payments.map((payment) => (
                    <tr key={payment.id} className={payment.voided ? "opacity-60" : undefined}>
                      <td>
                        <a
                          href={resolveClientApiUrl(`/schools/fees/receipts/${payment.id}`)}
                          className="font-mono text-theme-accent hover:underline"
                        >
                          {payment.receipt_number}
                        </a>
                      </td>
                      <td>
                        <div>{payment.student_name}</div>
                        {payment.learner_id ? <div className="text-xs text-theme-muted">{payment.learner_id}</div> : null}
                      </td>
                      <td>{payment.class_name ?? "—"}</td>
                      <td>{payment.term_name ?? "—"}</td>
                      <td>{formatUGX(payment.amount)}</td>
                      <td>{paymentMethodLabel(payment.payment_method)}</td>
                      <td>{new Date(payment.payment_date).toLocaleDateString()}</td>
                      <td>{payment.recorded_by_name ?? "—"}</td>
                      <td>{payment.voided ? <span className="text-theme-danger line-through">Voided</span> : <FeeStatusBadge status="paid" />}</td>
                      <td>
                        <div className="flex gap-2">
                          <a
                            href={resolveClientApiUrl(`/schools/fees/receipts/${payment.id}`)}
                            className="text-xs text-theme-accent hover:underline"
                          >
                            PDF
                          </a>
                          <CanDo action="voidPayments">
                            {!payment.voided ? (
                              <button
                                type="button"
                                className="text-xs text-theme-danger hover:underline"
                                onClick={() => setVoidPayment(payment)}
                              >
                                Void
                              </button>
                            ) : null}
                          </CanDo>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="ms-btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <button
                type="button"
                className="ms-btn-secondary"
                disabled={page * payload.limit >= payload.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </QueryState>

      <VoidPaymentDialog payment={voidPayment} onClose={() => setVoidPayment(null)} onVoided={() => void mutate()} />
    </section>
  );
}
