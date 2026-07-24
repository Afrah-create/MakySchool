"use client";

import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { FeeStatusBadge } from "@/components/fees/FeeStatusBadge";
import { PdfDownloadButton } from "@/components/fees/PdfDownloadButton";
import { useApiSWR } from "@/hooks/useApiSWR";
import { formatUGX } from "@/lib/formatCurrency";
import { paymentMethodLabel, type StudentFeeAccount } from "@/lib/fees/types";
import type { LearnerMe } from "@/lib/learner/types";

export function LearnerFeesContent() {
  const me = useApiSWR<LearnerMe>("/schools/learner/me");
  const fees = useApiSWR<{ accounts: StudentFeeAccount[] }>("/schools/learner/fees");

  const isLoading = me.isLoading || fees.isLoading;
  const error = me.error || fees.error;

  return (
    <DashboardPage
      embedded
      maxWidth="5xl"
      eyebrow="Learner portal"
      title="School fees"
      description="Outstanding balances and payment history for this learner."
    >
      <QueryState
        error={error}
        isLoading={isLoading}
        data={fees.data && me.data ? { accounts: fees.data.accounts, learner: me.data } : undefined}
        onRetry={() => {
          void me.mutate();
          void fees.mutate();
        }}
        loading={
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
            <Skeleton className="h-48" />
          </div>
        }
        empty={
          <EmptyState
            title="No fee records yet"
            description="Fee accounts appear here once the school assigns fees for this class."
          />
        }
        isEmpty={(payload) => payload.accounts.length === 0}
      >
        {(payload) => {
          const { learner, accounts } = payload;
          const balance = learner.fees.total_balance;

          return (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-theme bg-theme-surface p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">
                    Balance
                  </p>
                  <p
                    className={`mt-2 text-xl font-semibold tabular-nums ${
                      balance > 0 ? "text-theme-danger" : "text-theme-success"
                    }`}
                  >
                    {formatUGX(balance)}
                  </p>
                </div>
                <div className="rounded-2xl border border-theme bg-theme-surface p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">
                    Total paid
                  </p>
                  <p className="mt-2 text-xl font-semibold tabular-nums text-theme-primary">
                    {formatUGX(learner.fees.total_paid)}
                  </p>
                </div>
                <div className="rounded-2xl border border-theme bg-theme-surface p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">
                    Amount owed
                  </p>
                  <p className="mt-2 text-xl font-semibold tabular-nums text-theme-primary">
                    {formatUGX(learner.fees.total_owed)}
                  </p>
                </div>
              </div>

              {accounts.map((account) => (
                <div key={account.id} className="rounded-2xl border border-theme bg-theme-surface p-5">
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
                      <dd className="font-semibold text-theme-danger">
                        {formatUGX(account.balance)}
                      </dd>
                    </div>
                  </dl>

                  {account.payments.length > 0 ? (
                    <div className="mt-4 overflow-x-auto rounded-xl border border-theme">
                      <table className="ms-table w-full min-w-[28rem] text-sm">
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
                                <PdfDownloadButton
                                  path={`/schools/fees/receipts/${payment.id}`}
                                  label={payment.receipt_number}
                                  className="font-mono text-theme-accent hover:underline"
                                />
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
          );
        }}
      </QueryState>
    </DashboardPage>
  );
}
