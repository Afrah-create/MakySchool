"use client";

import Link from "next/link";
import { BookOpen, GraduationCap, Users } from "lucide-react";
import type { ClassWithDetails } from "@makyschool/shared/types";
import { QueryState } from "@/components/ui/QueryState";
import { SkeletonStatGrid } from "@/components/ui/Skeleton";
import { useTenantSWR } from "@/hooks/useTenantSWR";

export function DashboardStats() {
  const {
    data: classes,
    isLoading: loadingClasses,
    isValidating: validatingClasses,
    error: classesError,
    mutate: mutateClasses,
  } = useTenantSWR<ClassWithDetails[]>("/schools/classes");

  const {
    data: subjects,
    isLoading: loadingSubjects,
    isValidating: validatingSubjects,
    error: subjectsError,
    mutate: mutateSubjects,
  } = useTenantSWR<unknown[]>("/schools/subjects");

  const isLoading =
    (loadingClasses && classes === undefined) || (loadingSubjects && subjects === undefined);
  const isValidating = validatingClasses || validatingSubjects;
  const error = classesError ?? subjectsError;
  const hasData = classes !== undefined && subjects !== undefined;

  const retry = () => {
    void mutateClasses();
    void mutateSubjects();
  };

  const studentCount = classes?.reduce((sum, c) => sum + (c.student_count ?? 0), 0) ?? 0;

  const cards = [
    {
      key: "classes",
      label: "Classes",
      value: classes?.length ?? 0,
      icon: GraduationCap,
      href: "/dashboard/classes",
      accent: "text-theme-accent",
      bg: "bg-theme-accent-muted",
    },
    {
      key: "subjects",
      label: "Subjects",
      value: subjects?.length ?? 0,
      icon: BookOpen,
      href: "/dashboard/classes",
      accent: "text-theme-accent",
      bg: "bg-theme-accent-muted",
    },
    {
      key: "students",
      label: "Enrolled students",
      value: studentCount,
      icon: Users,
      href: "/dashboard/classes",
      accent: "text-theme-muted",
      bg: "bg-theme-icon",
    },
  ] as const;

  return (
    <QueryState
      isLoading={isLoading && !hasData}
      isValidating={isValidating}
      error={error}
      data={hasData ? { classes: classes!, subjects: subjects! } : undefined}
      onRetry={retry}
      loading={<SkeletonStatGrid count={3} layout="grid" />}
      showRefreshing={false}
    >
      {() => (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.key}
                href={card.href}
                className="group rounded-xl border border-theme bg-theme-surface p-5 transition hover:border-theme-strong"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${card.bg} ${card.accent} transition group-hover:scale-105`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-theme-muted">
                    {card.label}
                  </span>
                </div>
                <p className="mt-4 text-3xl font-semibold tabular-nums text-theme-primary">
                  {card.value}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </QueryState>
  );
}
