"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CanDo } from "@/components/ui/CanDo";
import { FeeStatusBadge } from "@/components/fees/FeeStatusBadge";
import { FeesStatStrip } from "@/components/fees/FeesStatStrip";
import { SmsReminderPanel } from "@/components/fees/SmsReminderPanel";
import { WaiveFeeDialog } from "@/components/fees/WaiveFeeDialog";
import { DataListPanel } from "@makyschool/ui/components/ui/DataListPanel";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { PageHeader } from "@makyschool/ui/components/ui/PageHeader";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { useApiSWR } from "@/hooks/useApiSWR";
import { useFeesBasePath } from "@/hooks/useFeesBasePath";
import { formatUGX } from "@/lib/formatCurrency";
import { type OutstandingStudent } from "@/lib/fees/types";

type OutstandingResponse = {
  students: OutstandingStudent[];
  summary: {
    total_students: number;
    total_outstanding: number;
    unpaid_count: number;
    partial_count: number;
  };
  page: number;
  total: number;
};

export function OutstandingFeesContent() {
  const base = useFeesBasePath();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [smsOpen, setSmsOpen] = useState(false);
  const [waiveStudent, setWaiveStudent] = useState<OutstandingStudent | null>(null);
  const { data, error, isLoading, mutate } = useApiSWR<OutstandingResponse>("/schools/fees/outstanding?limit=100");

  const selectedStudents = useMemo(
    () => (data?.students ?? []).filter((student) => selected.has(student.account_id)),
    [data, selected],
  );

  function toggle(accountId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }

  function exportCsv() {
    const rows = data?.students ?? [];
    const header = ["Student", "Learner ID", "Class", "Guardian", "Phone", "Owed", "Paid", "Balance", "Status", "Term"];
    const lines = rows.map((row) => [
      row.full_name,
      row.learner_id,
      row.class_name,
      row.guardian_name ?? "",
      row.guardian_phone ?? "",
      row.amount_owed,
      row.amount_paid,
      row.balance,
      row.status,
      row.term_name,
    ]);
    const csv = [header, ...lines].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "outstanding-fees.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Outstanding fees"
        description="Students with unpaid or partial balances."
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" className="ms-btn-secondary" onClick={() => window.print()}>
              Print
            </button>
            <button type="button" className="ms-btn-secondary" onClick={exportCsv}>
              Export CSV
            </button>
          </div>
        }
      />

      <QueryState
        error={error}
        isLoading={isLoading}
        data={data}
        onRetry={() => void mutate()}
        loading={<Skeleton className="h-64" />}
        empty={
          <EmptyState title="No outstanding fees." description="All students are up to date for the selected filters." />
        }
        isEmpty={(payload) => payload.students.length === 0}
      >
        {(payload) => (
          <>
            <FeesStatStrip
              items={[
                { label: "Students", value: payload.summary.total_students },
                {
                  label: "Total outstanding",
                  value: formatUGX(payload.summary.total_outstanding),
                  tone: payload.summary.total_outstanding > 0 ? "danger" : "default",
                },
                { label: "Unpaid / partial", value: `${payload.summary.unpaid_count} / ${payload.summary.partial_count}` },
              ]}
            />

            <DataListPanel
              toolbar={
                selected.size > 0 ? (
                  <CanDo action="recordPayments">
                    <button type="button" className="ms-btn-secondary text-sm" onClick={() => setSmsOpen(true)}>
                      Send SMS reminder to selected ({selected.size})
                    </button>
                  </CanDo>
                ) : undefined
              }
            >
              <div className="overflow-x-auto">
                <table className="ms-table w-full min-w-[52rem]">
                  <thead>
                    <tr>
                      <th className="w-10" />
                      <th>Student</th>
                      <th>Class</th>
                      <th>Guardian</th>
                      <th className="text-right">Owed</th>
                      <th className="text-right">Paid</th>
                      <th className="text-right">Balance</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {payload.students.map((student) => (
                      <tr key={student.account_id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.has(student.account_id)}
                            onChange={() => toggle(student.account_id)}
                            aria-label={`Select ${student.full_name}`}
                          />
                        </td>
                        <td>
                          <div className="font-medium">{student.full_name}</div>
                          <div className="text-xs text-theme-muted">{student.learner_id}</div>
                        </td>
                        <td>{student.class_name}</td>
                        <td>
                          <div>{student.guardian_name ?? "—"}</div>
                          {student.guardian_phone ? (
                            <div className="text-xs text-theme-muted">{student.guardian_phone}</div>
                          ) : null}
                        </td>
                        <td className="text-right tabular-nums">{formatUGX(student.amount_owed)}</td>
                        <td className="text-right tabular-nums">{formatUGX(student.amount_paid)}</td>
                        <td className="text-right tabular-nums font-semibold text-theme-danger">
                          {formatUGX(student.balance)}
                        </td>
                        <td>
                          <FeeStatusBadge status={student.status} />
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-2">
                            <CanDo action="recordPayments">
                              <Link
                                href={`${base}/payments/new?student_id=${student.student_id}`}
                                className="text-xs text-theme-accent hover:underline"
                              >
                                Pay
                              </Link>
                            </CanDo>
                            <CanDo action="waiveFees">
                              <button
                                type="button"
                                className="text-xs text-theme-danger hover:underline"
                                onClick={() => setWaiveStudent(student)}
                              >
                                Waive
                              </button>
                            </CanDo>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DataListPanel>
          </>
        )}
      </QueryState>

      <SmsReminderPanel open={smsOpen} onClose={() => setSmsOpen(false)} students={selectedStudents} />
      <WaiveFeeDialog student={waiveStudent} onClose={() => setWaiveStudent(null)} onWaived={() => void mutate()} />
    </section>
  );
}
