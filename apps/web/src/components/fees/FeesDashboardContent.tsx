"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileText, History } from "lucide-react";
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
import { DataListPanel } from "@makyschool/ui/components/ui/DataListPanel";
import { PageHeader } from "@makyschool/ui/components/ui/PageHeader";

type DashboardData = {
  stats: FeesDashboardStats;
  recent_payments: FeePayment[];
};

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
    <section className="space-y-6">
      <PageHeader
        title="Fees"
        description={
          isAdmin
            ? "Configure fee structures and monitor collections. Day-to-day payments are handled by your bursar."
            : "Bursar dashboard — record payments and follow up on balances."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {isAdmin ? (
              <CanDo action="manageUsers">
                <button type="button" className="ms-btn-secondary" onClick={() => setAddBursarOpen(true)}>
                  Add bursar user
                </button>
              </CanDo>
            ) : null}
            {!isAdmin ? (
              <CanDo action="recordPayments">
                <Link href={`${base}/payments/new`} className="ms-btn-primary inline-flex items-center gap-2">
                  Record payment
                </Link>
              </CanDo>
            ) : null}
          </div>
        }
      />

      <QueryState
        error={error}
        isLoading={isLoading}
        data={data}
        onRetry={() => void mutate()}
        loading={
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
            <Skeleton className="h-48" />
          </div>
        }
        empty={
          <EmptyState
            title="No fees recorded yet."
            description={
              isAdmin
                ? "Create a fee structure for each class and term to get started."
                : "Start by setting up a fee structure."
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
                { label: "Collected this term", value: formatUGX(dashboard.stats.total_collected) },
                {
                  label: "Outstanding this term",
                  value: formatUGX(dashboard.stats.total_outstanding),
                  tone: dashboard.stats.total_outstanding > 0 ? "danger" : "default",
                },
                { label: "Fully paid", value: dashboard.stats.students_fully_paid },
                { label: "With balance", value: dashboard.stats.students_with_balance },
              ]}
            />

            <div className="flex flex-wrap gap-2">
              <Link href={`${base}/structures`} className="ms-btn-secondary inline-flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Fee structures
              </Link>
              <Link href={`${base}/payments`} className="ms-btn-secondary inline-flex items-center gap-2">
                <History className="h-4 w-4" />
                Payment history
              </Link>
              {!isAdmin ? (
                <>
                  <CanDo action="recordPayments">
                    <Link href={`${base}/payments/new`} className="ms-btn-secondary inline-flex items-center gap-2">
                      Record payment
                    </Link>
                  </CanDo>
                  <Link href={`${base}/outstanding`} className="ms-btn-secondary inline-flex items-center gap-2">
                    View outstanding
                  </Link>
                </>
              ) : null}
            </div>

            <DataListPanel>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-theme px-4 py-3 sm:px-5">
                <h2 className="text-sm font-semibold text-theme-primary">Recent payments</h2>
                <Link href={`${base}/payments`} className="text-xs font-medium text-theme-accent hover:underline">
                  View all
                </Link>
              </div>
              {dashboard.recent_payments.length === 0 ? (
                <p className="px-4 py-6 text-sm text-theme-muted sm:px-5">No payments recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
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
                        <td>{formatUGX(payment.amount)}</td>
                        <td>{paymentMethodLabel(payment.payment_method)}</td>
                        <td>{new Date(payment.payment_date).toLocaleDateString()}</td>
                      </tr>
                    ))}
                    </tbody>
                  </table>
                </div>
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
    </section>
  );
}
