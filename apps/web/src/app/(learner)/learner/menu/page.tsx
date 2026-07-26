"use client";

import { useMemo } from "react";
import { useCurrentRole } from "@/hooks/useCurrentRole";
import { MobileMenuContent } from "@/components/layout/mobile/MobileMenuContent";
import {
  filterPortalNavGroupsByRole,
  portalGroupsToGrouped,
} from "@/lib/roles/portal-nav";
import { learnerNavGroups } from "@/lib/roles/learner-nav";

export default function LearnerMenuPage() {
  const role = useCurrentRole();

  const groups = useMemo(() => {
    if (!role) return [];
    return portalGroupsToGrouped(filterPortalNavGroupsByRole(learnerNavGroups, role));
  }, [role]);

  return (
    <div className="lg:hidden">
      <p className="mb-4 text-sm text-theme-muted">
        Attendance, report cards, profile, and more.
      </p>
      <MobileMenuContent groups={groups} />
    </div>
  );
}
