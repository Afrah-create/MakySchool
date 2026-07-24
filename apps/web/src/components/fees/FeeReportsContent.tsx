"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { FeesPageShell } from "@/components/fees/FeesPageShell";
import { useApiSWR } from "@/hooks/useApiSWR";
import { formatUGX } from "@/lib/formatCurrency";
import { paymentMethodLabel, type FeePayment } from "@/lib/fees/types";

const PIE_COLORS = [
  "var(--color-accent)",
  "var(--color-success-dot)",
  "var(--color-warning-dot)",
  "var(--color-info-dot)",
  "var(--color-danger-dot)",
];

export function FeeReportsContent() {
  const { data: structures } = useApiSWR<
    Array<{
      class_name: string;
      term_name: string;
      total_collected: number;
      total_outstanding: number;
      amount: number;
      student_count: number;
    }>
  >("/schools/fees/structures");
  const { data: paymentsData, error, isLoading, mutate } = useApiSWR<{
    payments: FeePayment[];
  }>("/schools/fees/payments?limit=100");

  const collectionByClass = useMemo(
    () =>
      (structures ?? []).map((row) => ({
        name: row.class_name,
        collected: Number(row.total_collected ?? 0),
        outstanding: Number(row.total_outstanding ?? 0),
        expected: Number(row.amount) * Number(row.student_count ?? 0),
      })),
    [structures],
  );

  const methods = useMemo(() => {
    const map = new Map<string, { name: string; count: number; total: number }>();
    for (const payment of paymentsData?.payments ?? []) {
      if (payment.voided) continue;
      const key = payment.payment_method;
      const existing = map.get(key) ?? { name: paymentMethodLabel(key), count: 0, total: 0 };
      existing.count += 1;
      existing.total += payment.amount;
      map.set(key, existing);
    }
    return [...map.values()];
  }, [paymentsData]);

  const daily = useMemo(() => {
    const map = new Map<string, { date: string; count: number; total: number }>();
    for (const payment of paymentsData?.payments ?? []) {
      if (payment.voided) continue;
      const date = payment.payment_date;
      const existing = map.get(date) ?? { date, count: 0, total: 0 };
      existing.count += 1;
      existing.total += payment.amount;
      map.set(date, existing);
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [paymentsData]);

  return (
    <FeesPageShell title="Fee reports" description="Collection summaries and payment breakdowns.">
      <QueryState
        error={error}
        isLoading={isLoading}
        data={paymentsData}
        onRetry={() => void mutate()}
        loading={<Skeleton className="h-64 rounded-2xl" />}
        isEmpty={() => false}
      >
        {() => (
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            <ReportCard title="Collection summary by class">
              <div className="h-56 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={collectionByClass}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={56} />
                    <Tooltip formatter={(value: number) => formatUGX(value)} />
                    <Bar dataKey="collected" fill="var(--color-accent)" name="Collected" radius={[4, 4, 0, 0]} />
                    <Bar
                      dataKey="outstanding"
                      fill="var(--color-danger-dot)"
                      name="Outstanding"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ReportCard>

            <ReportCard title="Payment methods breakdown">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="mx-auto h-52 w-full max-w-xs sm:h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={methods} dataKey="total" nameKey="name" innerRadius={45} outerRadius={80}>
                        {methods.map((_, index) => (
                          <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatUGX(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="overflow-x-auto">
                  <table className="ms-table w-full text-sm">
                    <thead>
                      <tr>
                        <th>Method</th>
                        <th>Count</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {methods.map((row) => (
                        <tr key={row.name}>
                          <td>{row.name}</td>
                          <td>{row.count}</td>
                          <td className="tabular-nums">{formatUGX(row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </ReportCard>

            <ReportCard title="Daily collection log" className="lg:col-span-2">
              <div className="overflow-x-auto rounded-xl border border-theme">
                <table className="ms-table w-full min-w-[20rem] text-sm">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Payments</th>
                      <th>Total collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-8 text-center text-theme-muted">
                          No payments in the recent window.
                        </td>
                      </tr>
                    ) : (
                      daily.map((row) => (
                        <tr key={row.date}>
                          <td>{new Date(row.date).toLocaleDateString()}</td>
                          <td>{row.count}</td>
                          <td className="tabular-nums">{formatUGX(row.total)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </ReportCard>
          </div>
        )}
      </QueryState>
    </FeesPageShell>
  );
}

function ReportCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-theme bg-theme-surface p-4 sm:p-5 ${className ?? ""}`}>
      <h2 className="mb-4 text-sm font-semibold text-theme-primary">{title}</h2>
      {children}
    </div>
  );
}
