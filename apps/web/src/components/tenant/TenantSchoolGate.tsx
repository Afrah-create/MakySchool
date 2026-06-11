"use client";

import type { SchoolRecord } from "@makyschool/shared/types";
import { useTenantSchool } from "@/providers/TenantSchoolProvider";

export function TenantSchoolGate({
  children,
}: {
  children: (school: SchoolRecord, schoolSlug: string) => React.ReactNode;
}) {
  const { school, schoolSlug } = useTenantSchool();

  if (!school) {
    return (
      <div className="px-4 py-12 text-center text-sm text-slate-500">
        Loading school context…
      </div>
    );
  }

  return <>{children(school, schoolSlug)}</>;
}
