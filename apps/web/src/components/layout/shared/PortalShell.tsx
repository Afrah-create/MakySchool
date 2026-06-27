"use client";

import type { ReactNode } from "react";
import type { UserRole } from "@makyschool/shared/types";
import { PortalMobileNav, PortalSidebar } from "@/components/layout/shared/PortalNav";
import { TenantDashboardShell } from "@/components/layout/TenantDashboardShell";
import { bursarNavGroups, learnerNavGroups, teacherNavGroups } from "@/lib/roles";
import type { PortalNavGroup } from "@/lib/roles/portal-nav";

const navByPortal = {
  teacher: { groups: teacherNavGroups, storagePrefix: "portal-teacher" },
  learner: { groups: learnerNavGroups, storagePrefix: "portal-learner" },
  bursar: { groups: bursarNavGroups, storagePrefix: "portal-bursar" },
} as const satisfies Record<string, { groups: PortalNavGroup[]; storagePrefix: string }>;

export function PortalShell({
  schoolName,
  role,
  portal,
  children,
}: {
  schoolName?: string | null;
  role: UserRole;
  portal: keyof typeof navByPortal;
  children: ReactNode;
}) {
  const { groups, storagePrefix } = navByPortal[portal];

  return (
    <TenantDashboardShell
      sidebar={
        <PortalSidebar
          schoolName={schoolName}
          role={role}
          navGroups={groups}
          storagePrefix={storagePrefix}
        />
      }
      header={
        <PortalMobileNav
          schoolName={schoolName}
          role={role}
          navGroups={groups}
          storagePrefix={storagePrefix}
        />
      }
    >
      {children}
    </TenantDashboardShell>
  );
}
