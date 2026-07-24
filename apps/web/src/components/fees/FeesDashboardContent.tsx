"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  FileText,
  History,
  PlusCircle,
  Receipt,
  Wallet,
} from "lucide-react";
import { CanDo } from "@/components/ui/CanDo";
import { AddUserPanel } from "@/components/users/AddUserPanel";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { useApiSWR } from "@/hooks/useApiSWR";
import { useFeesBasePath, useFeesPortal } from "@/hooks/useFeesBasePath";
import { formatUGX } from "@/lib/formatCurrency";
import { paymentMethodLabel, type FeePayment, type FeesDashboardStats } from "@/lib/fees/types";
import { PdfDownloadButton } from "@/components/fees/PdfDownloadButton";
import { FeesStatStrip } from "@/components/fees/FeesStatStrip";
import { FeesPageShell } from "@/components/fees/FeesPageShell";
import { DataListPanel } from "@makyschool/ui/components/ui/DataListPanel";

type DashboardData = {
  stats: FeesDashboardStats;
  recent_payments: FeePayment[];
};

function QuickLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: typeof FileText;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-theme bg-theme-surface p-4 transition hover:border-accent-soft"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-theme-accent-muted text-theme-accent">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-theme-primary">{title}</p>
        <p className="text-xs text-theme-muted">{description}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-theme-muted" />
    </Link>
  );
}

export function FeesDashboardContent({ variant = "bursar" }: { variant?: "bursar" | "admin" }) {
  const portal = useFeesPortal();
  const isAdmin = variant === "admin" || portal === "admin";
  const base = useFeesBasePath();
  const { data, error, isLoading, mutate } = useApiSWR<DashboardData>("/schools/fees/dashboard-stats");
  const [addBursarOpen, setAddBursarOpen] = useState(false);

  const hasData = useMemo(
    () => (data?.stats.total_collected ?? 0) > 0 || (data?.recent_payments.length ?? 0) > 0,
    [data],
  );

  return (
    <FeesPageShell
      eyebrow={isAdmin ? "Finance" : "Bursar"}
      title="Fees dashboard"
      description={
        isAdmin
          ? "Configure fee structures and monitor collections. Day-to-day payments are handled by your bursar."
          : "Record payments, follow up on balances, and keep fee records up to date."
      }
      actions={
        <div className="flex flex-wrap gap-2">
          {isAdmin ? (
            <CanDo action="manageUsers">
              <button type="button" className="ms-btn-secondary" onClick={() => setAddBursarOpen(true)}>
                Add bursar user
              </button>
            </CanDo>
          ) : (
            <CanDo action="recordPayments">
              <Link href={`${base}/payments/new`} className="ms-btn-primary inline-flex items-center gap-2">
                <PlusCircle className="h-4 w-4" />
                Record payment
              </Link>
            </CanDo>
          )}
        </div>
      }
    >
      {!isAdmin ? (
        <div className="ms-hero relative overflow-hidden rounded-2xl p-5 sm:p-7">
          <div className="relative max-w-xl">
            <p className="text-sm font-medium text-white/80">Today&apos;s collections</p>
            <h2 className="mt-1 text-2xl font-semibold sm:text-3xl">
              {data ? formatUGX(data.stats.total_collected) : "—"}
            </h2>
            <p className="mt-2 text-sm text-white/85">
              {data && data.stats.total_outstanding > 0
                ? `${formatUGX(data.stats.total_outstanding)} still outstanding this term.`
                : "Track payments and outstanding balances from one place."}
            </p>
          </div>
        </div>
      ) : null}

      <QueryState
        error={error}
        isLoading={isLoading}
        data={data}
        onRetry={() => void mutate()}
        loading={
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        }
        empty={
          <EmptyState
            title="No fees recorded yet."
            description={
              isAdmin
                ? "Create a fee structure for each class and term to get started."
                : "Ask your administrator to set up fee structures, then start recording payments."
            }
            action={
              <CanDo action="manageFees">
                <Link href={`${base}/structures`} className="ms-btn-primary inline-flex">
                  {isAdmin ? "Set up fee structures" : "Manage fee structures"}
                </Link>
              </CanDo>
            }
          />
        }
        isEmpty={() => !hasData}
      >
        {(dashboard) => (
          <>
            <FeesStatStrip
              items={[
                {
                  label: "Collected this term",
                  value: formatUGX(dashboard.stats.total_collected),
                  tone: "success",
                },
                {
                  label: "Outstanding",
                  value: formatUGX(dashboard.stats.total_outstanding),
                  tone: dashboard.stats.total_outstanding > 0 ? "danger" : "default",
                },
                { label: "Fully paid", value: dashboard.stats.students_fully_paid },
                { label: "With balance", value: dashboard.stats.students_with_balance },
              ]}
            />

            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-theme-primary">Quick links</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <QuickLink
                  href={`${base}/structures`}
                  icon={FileText}
                  title="Fee structures"
                  description="Class and term fee amounts"
                />
                <QuickLink
                  href={`${base}/payments`}
                  icon={History}
                  title="Payment history"
                  description="Receipts and ledger"
                />
                {!isAdmin ? (
                  <>
                    <QuickLink
                      href={`${base}/outstanding`}
                      icon={AlertCircle}
                      title="Outstanding"
                      description="Students with balances"
                    />
                    <QuickLink
                      href={`${base}/invoices`}
                      icon={Receipt}
                      title="Invoices"
                      description="Issue and track invoices"
                    />
                    <QuickLink
                      href={`${base}/other-income`}
                      icon={Wallet}
                      title="Other income"
                      description="Non-fee receipts"
                    />
                    <QuickLink
                      href={`${base}/reports`}
                      icon={FileText}
                      title="Reports"
                      description="Collections overview"
                    />
                  </>
                ) : null}
              </div>
            </section>

            <DataListPanel>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-theme px-4 py-3 sm:px-5">
                <div>
                  <h2 className="text-sm font-semibold text-theme-primary">Recent payments</h2>
                  <p className="text-xs text-theme-muted">Latest receipts recorded</p>
                </div>
                <Link
                  href={`${base}/payments`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-theme-accent hover:underline"
                >
                  View all
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              {dashboard.recent_payments.length === 0 ? (
                <p className="px-4 py-6 text-sm text-theme-muted sm:px-5">No payments recorded yet.</p>
              ) : (
                <>
                  {/* Mobile cards */}
                  <ul className="divide-y divide-theme md:hidden">
                    {dashboard.recent_payments.map((payment) => (
                      <li key={payment.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-theme-primary">{payment.student_name}</p>
                            <p className="mt-0.5 font-mono text-xs text-theme-muted">
                              {payment.receipt_number}
                            </p>
                          </div>
                          <p className="shrink-0 font-semibold tabular-nums text-theme-primary">
                            {formatUGX(payment.amount)}
                          </p>
                        </div>
                        <p className="mt-1 text-xs text-theme-muted">
                          {paymentMethodLabel(payment.payment_method)} ·{" "}
                          {new Date(payment.payment_date).toLocaleDateString()}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {/* Desktop table */}
                  <div className="hidden overflow-x-auto md:block">
                    <table className="ms-table w-full min-w-[32rem]">
                      <thead>
                        <tr>
                          <th>Receipt</th>
                          <th>Student</th>
                          <th>Amount</th>
                          <th>Method</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboard.recent_payments.map((payment) => (
                          <tr key={payment.id}>
                            <td>
                              <PdfDownloadButton
                                path={`/schools/fees/receipts/${payment.id}`}
                                label={payment.receipt_number}
                                className="font-mono text-theme-accent hover:underline"
                              />
                            </td>
                            <td>{payment.student_name}</td>
                            <td className="tabular-nums">{formatUGX(payment.amount)}</td>
                            <td>{paymentMethodLabel(payment.payment_method)}</td>
                            <td>{new Date(payment.payment_date).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </DataListPanel>
          </>
        )}
      </QueryState>

      {isAdmin ? (
        <AddUserPanel
          open={addBursarOpen}
          onClose={() => setAddBursarOpen(false)}
          onSaved={() => setAddBursarOpen(false)}
          defaultRole="bursar"
        />
      ) : null}
    </FeesPageShell>
  );
}
