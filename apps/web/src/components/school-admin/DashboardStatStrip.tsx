"use client";

import Link from "next/link";
import { BookOpen, GraduationCap, Users } from "lucide-react";
import type { ClassWithDetails } from "@makyschool/shared/types";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { SkeletonStatGrid } from "@makyschool/ui/components/ui/Skeleton";
import { useSchoolSWR } from "@/hooks/useSchoolSWR";

export function DashboardStatStrip() {
  const {
    data: classes,
    isLoading: loadingClasses,
    isValidating: validatingClasses,
    error: classesError,
    mutate: mutateClasses,
  } = useSchoolSWR<ClassWithDetails[]>("/schools/classes");

  const {
    data: subjects,
    isLoading: loadingSubjects,
    isValidating: validatingSubjects,
    error: subjectsError,
    mutate: mutateSubjects,
  } = useSchoolSWR<unknown[]>("/schools/subjects");

  const isLoading =
    (loadingClasses && classes === undefined) ||
    (loadingSubjects && subjects === undefined);
  const isValidating = validatingClasses || validatingSubjects;
  const error = classesError ?? subjectsError;
  const hasData = classes !== undefined && subjects !== undefined;

  const retry = () => {
    void mutateClasses();
    void mutateSubjects();
  };

  const studentCount =
    classes?.reduce((sum, row) => sum + (row.student_count ?? 0), 0) ?? 0;

  const cards = [
    {
      key: "classes",
      label: "Classes",
      value: classes?.length ?? 0,
      icon: GraduationCap,
      href: "/dashboard/classes",
      tone: "bg-theme-accent-muted text-theme-accent",
    },
    {
      key: "subjects",
      label: "Subjects",
      value: subjects?.length ?? 0,
      icon: BookOpen,
      href: "/dashboard/subjects",
      tone: "badge-info",
    },
    {
      key: "students",
      label: "Students",
      value: studentCount,
      icon: Users,
      href: "/dashboard/students",
      tone: "bg-theme-icon text-theme-muted",
    },
  ] as const;

  return (
    <QueryState
      isLoading={isLoading && !hasData}
      isValidating={isValidating}
      error={error}
      data={hasData ? { classes: classes!, subjects: subjects! } : undefined}
      onRetry={retry}
      loading={<SkeletonStatGrid count={3} layout="strip" />}
      showRefreshing={false}
    >
      {() => (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-theme-primary">
              At a glance
            </h2>
            <Link
              href="/dashboard/students"
              className="text-xs font-medium text-theme-accent hover:underline"
            >
              View students
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.key}
                  href={card.href}
                  className="ms-card group flex min-h-[6.5rem] flex-col justify-between p-3.5 transition hover:border-accent-soft sm:min-h-[7.5rem] sm:p-5"
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-lg sm:h-10 sm:w-10 sm:rounded-xl ${card.tone}`}
                  >
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </span>
                  <div>
                    <p className="text-lg font-semibold tabular-nums text-theme-primary sm:text-2xl">
                      {card.value}
                    </p>
                    <p className="mt-0.5 text-[11px] text-theme-muted sm:text-sm">
                      {card.label}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </QueryState>
  );
}
