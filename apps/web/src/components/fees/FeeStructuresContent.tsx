"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { CanDo } from "@/components/ui/CanDo";
import { AddFeeStructurePanel } from "@/components/fees/AddFeeStructurePanel";
import { AssignFeeStructureDialog } from "@/components/fees/AssignFeeStructureDialog";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-theme-primary">Fee Structures</h1>
          <p className="mt-1 text-sm text-theme-muted">Set expected fees per class and term</p>
        </div>
        <CanDo action="manageFees">
          <button type="button" className="ms-btn-primary inline-flex items-center gap-2" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add structure
          </button>
        </CanDo>
      </div>

      <QueryState
        error={error}
        isLoading={isLoading}
        data={data}
        onRetry={() => void mutate()}
        loading={<Skeleton className="h-64" />}
        empty={
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
        }
        isEmpty={(rows) => rows.length === 0}
      >
        {(structures) => (
          <div className="overflow-hidden rounded-xl border border-theme">
            <table className="ms-table w-full">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Term</th>
                  <th>Amount</th>
                  <th>Students</th>
                  <th>Collected</th>
                  <th>Outstanding</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {structures.map((row) => (
                  <tr key={row.id}>
                    <td className="font-medium">{row.class_name}</td>
                    <td>{row.term_name} {row.academic_year}</td>
                    <td>{formatUGX(Number(row.amount))}</td>
                    <td>
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
                    <td>{formatUGX(Number(row.total_collected ?? 0))}</td>
                    <td>{formatUGX(Number(row.total_outstanding ?? 0))}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <CanDo action="manageFees">
                          <button
                            type="button"
                            className="text-xs text-theme-accent hover:underline"
                            onClick={() => setAssignStructure(row)}
                          >
                            Assign to class
                          </button>
                        </CanDo>
                        <Link href={`${base}/payments`} className="text-xs text-theme-muted hover:underline">
                          View payments
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
