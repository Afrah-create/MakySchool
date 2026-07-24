"use client";

import { FileText, Receipt } from "lucide-react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { cn } from "@makyschool/ui/lib/cn";
import { FeeStatusBadge } from "@/components/fees/FeeStatusBadge";
import { PdfDownloadButton } from "@/components/fees/PdfDownloadButton";
import { useApiSWR } from "@/hooks/useApiSWR";
import { formatUGX } from "@/lib/formatCurrency";
import {
  invoiceStatusBadgeClass,
  paymentMethodLabel,
  type InvoiceStatus,
  type StudentFeeAccount,
} from "@/lib/fees/types";
import type { LearnerMe } from "@/lib/learner/types";

type LearnerInvoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date?: string | null;
  term_name: string;
  academic_year: number;
  status: InvoiceStatus;
  total_amount: number;
  amount_paid: number;
  balance: number;
  fee_structure_id?: string | null;
};

function formatShortDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function LearnerFeesContent() {
  const me = useApiSWR<LearnerMe>("/schools/learner/me");
  const fees = useApiSWR<{ accounts: StudentFeeAccount[] }>("/schools/learner/fees");
  const invoices = useApiSWR<{ invoices: LearnerInvoice[] }>("/schools/learner/invoices");

  const isLoading = me.isLoading || fees.isLoading || invoices.isLoading;
  const error = me.error || fees.error || invoices.error;

  return (
    <DashboardPage
      embedded
      maxWidth="5xl"
      eyebrow="Learner portal"
      title="School fees"
      description="View balances, invoices, and payment receipts for this learner."
    >
      <QueryState
        error={error}
        isLoading={isLoading}
        data={
          fees.data && me.data && invoices.data
            ? {
                accounts: fees.data.accounts,
                invoices: invoices.data.invoices,
                learner: me.data,
              }
            : undefined
        }
        onRetry={() => {
          void me.mutate();
          void fees.mutate();
          void invoices.mutate();
        }}
        loading={
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
            <Skeleton className="h-40" />
            <Skeleton className="h-48" />
          </div>
        }
        empty={
          <EmptyState
            title="No fee records yet"
            description="Invoices and balances appear here once the school assigns fees for this class."
          />
        }
        isEmpty={(payload) => payload.accounts.length === 0 && payload.invoices.length === 0}
      >
        {(payload) => {
          const { learner, accounts, invoices: invoiceList } = payload;
          const balance = learner.fees.total_balance;

          return (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-theme bg-theme-surface p-4 sm:p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">
                    Balance
                  </p>
                  <p
                    className={`mt-2 text-xl font-semibold tabular-nums sm:text-2xl ${
                      balance > 0 ? "text-theme-danger" : "text-theme-success"
                    }`}
                  >
                    {formatUGX(balance)}
                  </p>
                </div>
                <div className="rounded-2xl border border-theme bg-theme-surface p-4 sm:p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">
                    Total paid
                  </p>
                  <p className="mt-2 text-xl font-semibold tabular-nums text-theme-primary sm:text-2xl">
                    {formatUGX(learner.fees.total_paid)}
                  </p>
                </div>
                <div className="rounded-2xl border border-theme bg-theme-surface p-4 sm:p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">
                    Amount owed
                  </p>
                  <p className="mt-2 text-xl font-semibold tabular-nums text-theme-primary sm:text-2xl">
                    {formatUGX(learner.fees.total_owed)}
                  </p>
                </div>
              </div>

              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-theme-accent" />
                  <h2 className="text-base font-semibold text-theme-primary">Invoices</h2>
                </div>

                {invoiceList.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-theme bg-theme-surface/60 px-4 py-8 text-center text-sm text-theme-muted">
                    No invoices yet. They are created when fees are assigned to the class.
                  </div>
                ) : (
                  <>
                    {/* Mobile cards */}
                    <div className="space-y-3 md:hidden">
                      {invoiceList.map((invoice) => (
                        <article
                          key={invoice.id}
                          className="rounded-2xl border border-theme bg-theme-surface p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-mono text-sm font-semibold text-theme-primary">
                                {invoice.invoice_number}
                              </p>
                              <p className="mt-0.5 text-sm text-theme-muted">
                                {invoice.term_name} {invoice.academic_year}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "badge capitalize shrink-0",
                                invoiceStatusBadgeClass(invoice.status),
                              )}
                            >
                              {invoice.status}
                            </span>
                          </div>

                          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <dt className="text-theme-muted">Issued</dt>
                              <dd className="font-medium">{formatShortDate(invoice.invoice_date)}</dd>
                            </div>
                            <div>
                              <dt className="text-theme-muted">Due</dt>
                              <dd className="font-medium">{formatShortDate(invoice.due_date)}</dd>
                            </div>
                            <div>
                              <dt className="text-theme-muted">Total</dt>
                              <dd className="font-medium tabular-nums">
                                {formatUGX(invoice.total_amount)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-theme-muted">Balance</dt>
                              <dd
                                className={cn(
                                  "font-semibold tabular-nums",
                                  invoice.balance > 0 ? "text-theme-danger" : "text-theme-success",
                                )}
                              >
                                {formatUGX(invoice.balance)}
                              </dd>
                            </div>
                          </dl>

                          <PdfDownloadButton
                            path={`/schools/fees/invoices/${invoice.id}/pdf`}
                            label="Download invoice"
                            className="ms-btn-secondary mt-4 inline-flex w-full items-center justify-center gap-2 text-sm"
                          />
                        </article>
                      ))}
                    </div>

                    {/* Desktop table */}
                    <div className="hidden overflow-x-auto rounded-2xl border border-theme bg-theme-surface md:block">
                      <table className="ms-table w-full min-w-[40rem] text-sm">
                        <thead>
                          <tr>
                            <th>Invoice</th>
                            <th>Term</th>
                            <th>Issued</th>
                            <th>Due</th>
                            <th>Total</th>
                            <th>Balance</th>
                            <th>Status</th>
                            <th className="text-right">PDF</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invoiceList.map((invoice) => (
                            <tr key={invoice.id}>
                              <td className="font-mono font-medium">{invoice.invoice_number}</td>
                              <td>
                                {invoice.term_name} {invoice.academic_year}
                              </td>
                              <td>{formatShortDate(invoice.invoice_date)}</td>
                              <td>{formatShortDate(invoice.due_date)}</td>
                              <td className="tabular-nums">{formatUGX(invoice.total_amount)}</td>
                              <td
                                className={cn(
                                  "tabular-nums font-medium",
                                  invoice.balance > 0 ? "text-theme-danger" : "text-theme-success",
                                )}
                              >
                                {formatUGX(invoice.balance)}
                              </td>
                              <td>
                                <span
                                  className={cn(
                                    "badge capitalize",
                                    invoiceStatusBadgeClass(invoice.status),
                                  )}
                                >
                                  {invoice.status}
                                </span>
                              </td>
                              <td className="text-right">
                                <PdfDownloadButton
                                  path={`/schools/fees/invoices/${invoice.id}/pdf`}
                                  label="Download"
                                  className="inline-flex items-center gap-1.5 text-theme-accent hover:underline"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-theme-accent" />
                  <h2 className="text-base font-semibold text-theme-primary">Fee accounts</h2>
                </div>

                {accounts.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-theme bg-theme-surface/60 px-4 py-8 text-center text-sm text-theme-muted">
                    No fee accounts yet.
                  </div>
                ) : (
                  accounts.map((account) => (
                    <div key={account.id} className="rounded-2xl border border-theme bg-theme-surface p-4 sm:p-5">
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
                          <dd className="font-medium tabular-nums">{formatUGX(account.amount_owed)}</dd>
                        </div>
                        <div>
                          <dt className="text-theme-muted">Amount paid</dt>
                          <dd className="font-medium tabular-nums">{formatUGX(account.amount_paid)}</dd>
                        </div>
                        <div>
                          <dt className="text-theme-muted">Balance</dt>
                          <dd className="font-semibold tabular-nums text-theme-danger">
                            {formatUGX(account.balance)}
                          </dd>
                        </div>
                      </dl>

                      {account.payments.length > 0 ? (
                        <>
                          <div className="mt-4 space-y-2 md:hidden">
                            {account.payments.map((payment) => (
                              <div
                                key={payment.id}
                                className={cn(
                                  "rounded-xl border border-theme bg-theme-bg/40 px-3 py-3 text-sm",
                                  payment.voided && "opacity-60",
                                )}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <PdfDownloadButton
                                    path={`/schools/fees/receipts/${payment.id}`}
                                    label={payment.receipt_number}
                                    className="font-mono text-theme-accent hover:underline"
                                  />
                                  <span className="tabular-nums font-medium">
                                    {formatUGX(payment.amount)}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-theme-muted">
                                  {formatShortDate(payment.payment_date)} ·{" "}
                                  {paymentMethodLabel(payment.payment_method)}
                                </p>
                              </div>
                            ))}
                          </div>

                          <div className="mt-4 hidden overflow-x-auto rounded-xl border border-theme md:block">
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
                                  <tr
                                    key={payment.id}
                                    className={payment.voided ? "opacity-60" : undefined}
                                  >
                                    <td>
                                      <PdfDownloadButton
                                        path={`/schools/fees/receipts/${payment.id}`}
                                        label={payment.receipt_number}
                                        className="font-mono text-theme-accent hover:underline"
                                      />
                                    </td>
                                    <td className="tabular-nums">{formatUGX(payment.amount)}</td>
                                    <td>{formatShortDate(payment.payment_date)}</td>
                                    <td>{paymentMethodLabel(payment.payment_method)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      ) : (
                        <p className="mt-4 text-sm text-theme-muted">
                          No payments recorded for this term yet.
                        </p>
                      )}
                    </div>
                  ))
                )}
              </section>
            </div>
          );
        }}
      </QueryState>
    </DashboardPage>
  );
}
