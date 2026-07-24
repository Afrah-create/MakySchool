"use client";

import { useMemo, useState } from "react";
import { CanDo } from "@/components/ui/CanDo";
import { VoidPaymentDialog } from "@/components/fees/VoidPaymentDialog";
import { FeeStatusBadge } from "@/components/fees/FeeStatusBadge";
import { PdfDownloadButton } from "@/components/fees/PdfDownloadButton";
import { DataListPanel } from "@makyschool/ui/components/ui/DataListPanel";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { TablePagination } from "@makyschool/ui/components/ui/TablePagination";
import { FeesPageShell } from "@/components/fees/FeesPageShell";
import { useApiSWR } from "@/hooks/useApiSWR";
import { useFeesPortal } from "@/hooks/useFeesBasePath";
import { formatUGX } from "@/lib/formatCurrency";
import { paymentMethodLabel, type FeePayment } from "@/lib/fees/types";
import { DEFAULT_PAGE_SIZE } from "@makyschool/shared/constants";



type PaymentsResponse = {
  payments: FeePayment[];
  total: number;
  page: number;
  limit: number;
};

export function PaymentsHistoryContent() {
  const isAdminPortal = useFeesPortal() === "admin";
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [voidPayment, setVoidPayment] = useState<FeePayment | null>(null);
  const query = useMemo(() => `/schools/fees/payments?page=${page}&limit=${pageSize}`, [page, pageSize]);
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
    <FeesPageShell
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
    >
      <DataListPanel
        footer={
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            noun="payments"
          />
        }
      >
        <QueryState
          error={error}
          isLoading={isLoading}
          data={data}
          onRetry={() => void mutate()}
          loading={<Skeleton className="m-4 h-48 rounded-2xl" />}
          empty={
            <div className="p-6">
              <EmptyState title="No payments yet." description="Recorded payments will appear here." />
            </div>
          }
          isEmpty={(payload) => payload.payments.length === 0}
        >
          {(payload) => (
            <>
              <ul className="divide-y divide-theme lg:hidden">
                {payload.payments.map((payment) => (
                  <li
                    key={payment.id}
                    className={`px-4 py-4 ${payment.voided ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-theme-primary">{payment.student_name}</p>
                        <p className="mt-0.5 text-xs text-theme-muted">
                          {payment.learner_id ? `${payment.learner_id} · ` : ""}
                          {payment.class_name ?? "—"} · {payment.term_name ?? "—"}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold tabular-nums text-theme-primary">
                        {formatUGX(payment.amount)}
                      </p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-theme-muted">
                      <PdfDownloadButton
                        path={`/schools/fees/receipts/${payment.id}`}
                        label={payment.receipt_number}
                        className="font-mono text-theme-accent hover:underline"
                      />
                      <span>{paymentMethodLabel(payment.payment_method)}</span>
                      <span>{new Date(payment.payment_date).toLocaleDateString()}</span>
                      {payment.voided ? (
                        <span className="text-theme-danger">Voided</span>
                      ) : null}
                    </div>
                    <CanDo action="voidPayments">
                      {!payment.voided ? (
                        <button
                          type="button"
                          className="mt-2 text-xs font-medium text-theme-danger hover:underline"
                          onClick={() => setVoidPayment(payment)}
                        >
                          Void payment
                        </button>
                      ) : null}
                    </CanDo>
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-x-auto lg:block">
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
            </>
          )}
        </QueryState>
      </DataListPanel>

      <VoidPaymentDialog payment={voidPayment} onClose={() => setVoidPayment(null)} onVoided={() => void mutate()} />
    </FeesPageShell>
  );
}
