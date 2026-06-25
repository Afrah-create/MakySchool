"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { CanDo } from "@/components/ui/CanDo";
import { AddFeeStructurePanel } from "@/components/fees/AddFeeStructurePanel";
import { AssignFeeStructureDialog } from "@/components/fees/AssignFeeStructureDialog";
import { DataListPanel } from "@makyschool/ui/components/ui/DataListPanel";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { PageHeader } from "@makyschool/ui/components/ui/PageHeader";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { useApiSWR } from "@/hooks/useApiSWR";
import { useFeesBasePath } from "@/hooks/useFeesBasePath";
import { formatUGX } from "@/lib/formatCurrency";
import { type FeeStructure } from "@/lib/fees/types";

export function FeeStructuresContent() {
  const base = useFeesBasePath();
  const [addOpen, setAddOpen] = useState(false);
  const [assignStructure, setAssignStructure] = useState<FeeStructure | null>(null);
  const { data, error, isLoading, mutate } = useApiSWR<FeeStructure[]>("/schools/fees/structures");

  return (
    <section className="space-y-6">
      <PageHeader
        title="Fee structures"
        description="Set expected fees per class and term."
        actions={
          <CanDo action="manageFees">
            <button type="button" className="ms-btn-primary inline-flex items-center gap-2" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add structure
            </button>
          </CanDo>
        }
      />

      <DataListPanel>
        <QueryState
          error={error}
          isLoading={isLoading}
          data={data}
          onRetry={() => void mutate()}
          loading={<Skeleton className="m-4 h-48" />}
          empty={
            <div className="p-6">
              <EmptyState
                title="No fee structures yet."
                description="Create a fee structure for each class and term."
                action={
                  <CanDo action="manageFees">
                    <button type="button" className="ms-btn-primary" onClick={() => setAddOpen(true)}>
                      Add structure
                    </button>
                  </CanDo>
                }
              />
            </div>
          }
          isEmpty={(rows) => rows.length === 0}
        >
          {(structures) => (
            <div className="overflow-x-auto">
              <table className="ms-table w-full min-w-[44rem]">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Term</th>
                    <th className="text-right">Amount</th>
                    <th className="text-right">Students</th>
                    <th className="text-right">Collected</th>
                    <th className="text-right">Outstanding</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {structures.map((row) => (
                    <tr key={row.id}>
                      <td className="font-medium">{row.class_name}</td>
                      <td className="whitespace-nowrap">
                        {row.term_name} {row.academic_year}
                      </td>
                      <td className="text-right tabular-nums">{formatUGX(Number(row.amount))}</td>
                      <td className="text-right tabular-nums">
                        {row.student_count}
                        {row.student_count === 0 ? (
                          <CanDo action="manageFees">
                            <button
                              type="button"
                              className="ml-2 text-xs text-theme-accent hover:underline"
                              onClick={() => setAssignStructure(row)}
                            >
                              Assign
                            </button>
                          </CanDo>
                        ) : null}
                      </td>
                      <td className="text-right tabular-nums">{formatUGX(Number(row.total_collected ?? 0))}</td>
                      <td className="text-right tabular-nums">{formatUGX(Number(row.total_outstanding ?? 0))}</td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <CanDo action="manageFees">
                            <button
                              type="button"
                              className="text-xs text-theme-accent hover:underline"
                              onClick={() => setAssignStructure(row)}
                            >
                              Assign
                            </button>
                          </CanDo>
                          <Link href={`${base}/payments`} className="text-xs text-theme-muted hover:underline">
                            Payments
                          </Link>
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

      <AddFeeStructurePanel
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => void mutate()}
        onAssign={(structure) => {
          setAddOpen(false);
          setAssignStructure(structure);
        }}
      />
      <AssignFeeStructureDialog
        structure={assignStructure}
        onClose={() => setAssignStructure(null)}
        onAssigned={() => void mutate()}
      />
    </section>
  );
}
