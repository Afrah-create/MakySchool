"use client";

import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { formatClassLabel, sortClasses } from "@makyschool/shared/constants";
import type { ClassWithDetails } from "@makyschool/shared/types";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { SkeletonTable } from "@makyschool/ui/components/ui/Skeleton";
import { useTenantSWR } from "@/hooks/useTenantSWR";
import { useTenantSchool } from "@/providers/TenantSchoolProvider";

function statusForClass(classRow: ClassWithDetails) {
  if (classRow.capacity != null && classRow.student_count >= classRow.capacity) {
    return { label: "At capacity", tone: "badge-warning" as const };
  }
  if (classRow.subjects.length === 0) {
    return { label: "Needs subjects", tone: "badge-danger" as const };
  }
  return { label: "Active", tone: "badge-success" as const };
}

export function DashboardClassesTable() {
  const { school } = useTenantSchool();
  const { data: classes, isLoading, isValidating, error, mutate } =
    useTenantSWR<ClassWithDetails[]>("/schools/classes");

  return (
    <section className="ms-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-theme px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-theme-primary">Class overview</h2>
          <p className="mt-0.5 text-xs text-theme-muted">Enrollment and subject status by class</p>
        </div>
        <Link href="/dashboard/classes" className="text-xs font-medium text-theme-accent hover:underline">
          View all
        </Link>
      </div>

      <QueryState
        isLoading={isLoading}
        isValidating={isValidating}
        error={error}
        data={classes}
        onRetry={() => void mutate()}
        isEmpty={(items) => items.length === 0}
        loading={<SkeletonTable rows={4} />}
        empty={
          <div className="px-5 py-6">
            <EmptyState
              variant="compact"
              icon={GraduationCap}
              title="No classes yet"
              description="Create your first class to start organizing students and subjects."
              action={
                <Link href="/dashboard/classes" className="ms-btn-primary inline-flex rounded-lg px-4 py-2 text-sm">
                  Create your first class
                </Link>
              }
            />
          </div>
        }
        showRefreshing={false}
      >
        {(items) => {
          const rows = sortClasses(items, school?.school_type ?? null).slice(0, 8);

          return (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-table-header text-xs uppercase tracking-wide text-theme-muted">
                  <tr>
                    <th className="px-5 py-3 font-medium">Class</th>
                    <th className="px-5 py-3 font-medium">Students</th>
                    <th className="px-5 py-3 font-medium">Subjects</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme">
                  {rows.map((classRow) => {
                    const label = formatClassLabel(classRow.level, classRow.stream);
                    const status = statusForClass(classRow);

                    return (
                      <tr key={classRow.id} className="transition hover:bg-table-row-hover">
                        <td className="px-5 py-3.5 font-medium text-theme-primary">{label}</td>
                        <td className="px-5 py-3.5 text-theme-muted">
                          {classRow.student_count}
                          {classRow.capacity != null ? ` / ${classRow.capacity}` : ""}
                        </td>
                        <td className="px-5 py-3.5 text-theme-muted">{classRow.subjects.length}</td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${status.tone}`}
                          >
                            {status.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        }}
      </QueryState>
    </section>
  );
}
