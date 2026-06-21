"use client";

import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { ClassesManager } from "@/components/school-admin/ClassesManager";
import { SkeletonPanel } from "@makyschool/ui/components/ui/Skeleton";
import { useSchool } from "@/providers/SchoolProvider";

export function ClassesPageContent() {
  const { school, schoolSlug } = useSchool();

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
