"use client";

import { DashboardPage } from "@/components/layout/DashboardPage";
import { ClassesManager } from "@/components/tenant/ClassesManager";
import { SkeletonPanel } from "@/components/ui/Skeleton";
import { useTenantSchool } from "@/providers/TenantSchoolProvider";

export function ClassesPageContent() {
  const { school, schoolSlug } = useTenantSchool();

  if (!school) {
    return (
      <DashboardPage
        eyebrow="Academic structure"
        title="Classes & subjects"
        description="Organise levels, streams, and subject assignments."
      >
        <SkeletonPanel />
      </DashboardPage>
    );
  }

  return (
    <DashboardPage
      eyebrow="Academic structure"
      title="Classes & subjects"
      description={`Organise levels, streams, and subject assignments for ${school.name ?? "your school"}.`}
    >
      <ClassesManager schoolType={school.school_type ?? null} schoolSlug={schoolSlug} />
    </DashboardPage>
  );
}
