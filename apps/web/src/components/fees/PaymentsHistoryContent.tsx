"use client";

import { useMemo, useState } from "react";
import { CanDo } from "@/components/ui/CanDo";
import { VoidPaymentDialog } from "@/components/fees/VoidPaymentDialog";
import { FeeStatusBadge } from "@/components/fees/FeeStatusBadge";
import { PdfDownloadButton } from "@/components/fees/PdfDownloadButton";
import { DataListPanel } from "@makyschool/ui/components/ui/DataListPanel";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { PageHeader } from "@makyschool/ui/components/ui/PageHeader";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { TablePagination } from "@makyschool/ui/components/ui/TablePagination";
import { useApiSWR } from "@/hooks/useApiSWR";
import { useFeesPortal } from "@/hooks/useFeesBasePath";
import { formatUGX } from "@/lib/formatCurrency";
import { paymentMethodLabel, type FeePayment } from "@/lib/fees/types";

const PAGE_SIZE = 25;

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
  const query = useMemo(() => `/schools/fees/payments?page=${page}&limit=${PAGE_SIZE}`, [page]);
  const { data, error, isLoading, mutate } = useApiSWR<PaymentsResponse>(query);

  const total = data?.total ?? 0;

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
      <PageHeader
        title="Payment history"
        description={
          isAdminPortal
            ? "Read-only ledger of payments recorded by your bursar."
            : "All recorded fee payments."
        }
        actions={
          <button type="button" className="ms-btn-secondary" onClick={exportCsv}>
            Export CSV
          </button>
        }
      />

      <DataListPanel
        footer={
          total > PAGE_SIZE ? (
            <TablePagination
              summary={`Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total} payments`}
              onPrevious={() => setPage((p) => p - 1)}
              onNext={() => setPage((p) => p + 1)}
              previousDisabled={page <= 1}
              nextDisabled={page * PAGE_SIZE >= total}
            />
          ) : null
        }
      >
        <QueryState
          error={error}
          isLoading={isLoading}
          data={data}
          onRetry={() => void mutate()}
          loading={<Skeleton className="m-4 h-48" />}
          empty={
            <div className="p-6">
              <EmptyState title="No payments yet." description="Recorded payments will appear here." />
            </div>
          }
          isEmpty={(payload) => payload.payments.length === 0}
        >
          {(payload) => (
            <div className="overflow-x-auto">
              <table className="ms-table w-full min-w-[52rem]">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Student</th>
                    <th>Class</th>
                    <th>Term</th>
                    <th className="text-right">Amount</th>
                    <th>Method</th>
                    <th>Date</th>
                    <th>Recorded by</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {payload.payments.map((payment) => (
                    <tr key={payment.id} className={payment.voided ? "opacity-60" : undefined}>
                      <td>
                        <PdfDownloadButton
                          path={`/schools/fees/receipts/${payment.id}`}
                          label={payment.receipt_number}
                          className="font-mono text-sm text-theme-accent hover:underline"
                        />
                      </td>
                      <td>
                        <div>{payment.student_name}</div>
                        {payment.learner_id ? (
                          <div className="text-xs text-theme-muted">{payment.learner_id}</div>
                        ) : null}
                      </td>
                      <td>{payment.class_name ?? "—"}</td>
                      <td className="whitespace-nowrap">{payment.term_name ?? "—"}</td>
                      <td className="text-right tabular-nums">{formatUGX(payment.amount)}</td>
                      <td>{paymentMethodLabel(payment.payment_method)}</td>
                      <td className="whitespace-nowrap">
                        {new Date(payment.payment_date).toLocaleDateString()}
                      </td>
                      <td>{payment.recorded_by_name ?? "—"}</td>
                      <td>
                        {payment.voided ? (
                          <span className="text-theme-danger line-through">Voided</span>
                        ) : (
                          <FeeStatusBadge status="paid" />
                        )}
                      </td>
                      <td>
                        <div className="flex gap-2">
                          <PdfDownloadButton path={`/schools/fees/receipts/${payment.id}`} />
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
          )}
        </QueryState>
      </DataListPanel>

      <VoidPaymentDialog payment={voidPayment} onClose={() => setVoidPayment(null)} onVoided={() => void mutate()} />
    </section>
  );
}
