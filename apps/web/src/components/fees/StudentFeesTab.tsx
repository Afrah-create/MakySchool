"use client";

import Link from "next/link";
import { CanDo } from "@/components/ui/CanDo";
import { FeeStatusBadge } from "@/components/fees/FeeStatusBadge";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { useApiSWR } from "@/hooks/useApiSWR";
import { useFeesBasePath } from "@/hooks/useFeesBasePath";
import { formatUGX } from "@/lib/formatCurrency";
import { paymentMethodLabel, type StudentFeeAccount } from "@/lib/fees/types";
import { resolveClientApiUrl } from "@/lib/api/base-url";

export function StudentFeesTab({ studentId }: { studentId: string }) {
  const base = useFeesBasePath();
  const { data, error, isLoading, mutate } = useApiSWR<{ accounts: StudentFeeAccount[] }>(
    `/schools/fees/accounts/student/${studentId}`,
  );

  return (
    <QueryState
      error={error}
      isLoading={isLoading}
      data={data}
      onRetry={() => void mutate()}
      loading={<Skeleton className="h-40" />}
      empty={
        <EmptyState
          title="No fee records for this student yet."
          description="Assign a fee structure to the student's class to create fee accounts."
        />
      }
      isEmpty={(payload) => payload.accounts.length === 0}
    >
      {(payload) => (
        <div className="space-y-4">
          <CanDo action="recordPayments">
            <Link href={`${base}/payments/new?student_id=${studentId}`} className="ms-btn-primary inline-flex">
              Record payment
            </Link>
          </CanDo>

          {payload.accounts.map((account) => (
            <div key={account.id} className="rounded-xl border border-theme bg-theme-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-theme-primary">
                    {account.term_name} {account.academic_year}
                  </h3>
                  <p className="text-sm text-theme-muted">{account.class_name}</p>
                </div>
                <FeeStatusBadge status={account.status} />
              </div>

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-theme-muted">Amount owed</dt>
                  <dd className="font-medium">{formatUGX(account.amount_owed)}</dd>
                </div>
                <div>
                  <dt className="text-theme-muted">Amount paid</dt>
                  <dd className="font-medium">{formatUGX(account.amount_paid)}</dd>
                </div>
                <div>
                  <dt className="text-theme-muted">Balance</dt>
                  <dd className="font-semibold text-theme-danger">{formatUGX(account.balance)}</dd>
                </div>
              </dl>

              {account.payments.length > 0 ? (
                <div className="mt-4 overflow-hidden rounded-lg border border-theme">
                  <table className="ms-table w-full text-sm">
                    <thead>
                      <tr>
                        <th>Receipt</th>
                        <th>Amount</th>
                        <th>Date</th>
                        <th>Method</th>
                      </tr>
                    </thead>
                    <tbody>
                      {account.payments.map((payment) => (
                        <tr key={payment.id} className={payment.voided ? "opacity-60" : undefined}>
                          <td>
                            <a
                              href={resolveClientApiUrl(`/schools/fees/receipts/${payment.id}`)}
                              className="font-mono text-theme-accent hover:underline"
                            >
                              {payment.receipt_number}
                            </a>
                          </td>
                          <td>{formatUGX(payment.amount)}</td>
                          <td>{new Date(payment.payment_date).toLocaleDateString()}</td>
                          <td>{paymentMethodLabel(payment.payment_method)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-4 text-sm text-theme-muted">No payments recorded for this term yet.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </QueryState>
  );
}
