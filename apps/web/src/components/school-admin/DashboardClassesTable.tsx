"use client";

import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { formatClassLabel, sortClasses } from "@makyschool/shared/constants";
import type { ClassWithDetails } from "@makyschool/shared/types";
import { DataTable } from "@makyschool/ui/components/ui/DataTable";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { SkeletonTable } from "@makyschool/ui/components/ui/Skeleton";
import { useSchoolSWR } from "@/hooks/useSchoolSWR";
import { useSchool } from "@/providers/SchoolProvider";

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
  const { school } = useSchool();
  const { data: classes, isLoading, isValidating, error, mutate } =
    useSchoolSWR<ClassWithDetails[]>("/schools/classes");

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
            <DataTable minWidth="36rem" className="border-0 rounded-none">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Students</th>
                  <th>Subjects</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((classRow) => {
                  const label = formatClassLabel(classRow.level, classRow.stream);
                  const status = statusForClass(classRow);

                  return (
                    <tr key={classRow.id}>
                      <td className="font-medium">{label}</td>
                      <td className="text-muted">
                        {classRow.student_count}
                        {classRow.capacity != null ? ` / ${classRow.capacity}` : ""}
                      </td>
                      <td className="text-muted">{classRow.subjects.length}</td>
                      <td>
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
            </DataTable>
          );
        }}
      </QueryState>
    </section>
  );
}
