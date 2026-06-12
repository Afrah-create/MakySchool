"use client";

import { DashboardPage } from "@/components/layout/DashboardPage";
import { ClassesManager } from "@/components/tenant/ClassesManager";
import { useTenantSchool } from "@/providers/TenantSchoolProvider";

export function ClassesPageContent() {
  const { school, schoolSlug } = useTenantSchool();

  if (!school) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-sm text-theme-muted">
        Loading school context…
      </div>
    );
  }

  return (
    <DashboardPage
      eyebrow="Academic structure"
      title="Classes & subjects"
      description={`Organise levels, streams, and subject assignments for ${school.name ?? "your school"}.`}
    >
      <ClassesManager schoolType={school.school_type} schoolSlug={schoolSlug} />
    </DashboardPage>
  );
}
