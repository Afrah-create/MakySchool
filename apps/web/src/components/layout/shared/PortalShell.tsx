"use client";

import type { ReactNode } from "react";
import type { UserRole } from "@makyschool/shared/types";
import { DashboardTopBar } from "@/components/layout/DashboardTopBar";
import { PortalMobileNav, PortalSidebar } from "@/components/layout/shared/PortalNav";
import { DashboardShell } from "@makyschool/ui/components/layout/DashboardShell";
import { learnerNav, teacherNav } from "@/lib/roles";
import type { PortalNavItem } from "@/lib/roles/portal-nav";

const navByPortal = {
  teacher: teacherNav,
  learner: learnerNav,
} as const satisfies Record<string, PortalNavItem[]>;

export function PortalShell({
  schoolName,
  role,
  portal,
  portalLabel,
  children,
}: {
  schoolName?: string | null;
  role: UserRole;
  portal: keyof typeof navByPortal;
  portalLabel: string;
  children: ReactNode;
}) {
  const navItems = navByPortal[portal];

  return (
    <DashboardShell
      sidebar={
        <PortalSidebar
          schoolName={schoolName}
          role={role}
          navItems={navItems}
          portalLabel={portalLabel}
        />
      }
      header={
        <PortalMobileNav
          schoolName={schoolName}
          role={role}
          navItems={navItems}
          portalLabel={portalLabel}
        />
      }
      topBar={<DashboardTopBar />}
    >
      {children}
    </DashboardShell>
  );
}
