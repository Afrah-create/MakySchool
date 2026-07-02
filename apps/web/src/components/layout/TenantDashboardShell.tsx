import type { ReactNode } from "react";
import { DashboardRightRail } from "@/components/layout/DashboardRightRail";
import { DashboardTopBar } from "@/components/layout/DashboardTopBar";
import { DashboardContent } from "@makyschool/ui/components/layout/DashboardContent";
import { DashboardShell } from "@makyschool/ui/components/layout/DashboardShell";

/** Shared dashboard chrome for school-admin, teacher, bursar, and learner portals. */
export function TenantDashboardShell({
  sidebar,
  mobileChrome,
  children,
}: {
  sidebar: ReactNode;
  /** Mobile top bar only (legacy); prefer `mobileChrome`. */
  header?: ReactNode;
  mobileChrome?: ReactNode;
  children: ReactNode;
}) {
  return (
    <DashboardShell
      sidebar={sidebar}
      mobileChrome={mobileChrome}
      mobileBottomInset={Boolean(mobileChrome)}
      topBar={<DashboardTopBar />}
      rightRail={<DashboardRightRail />}
    >
      <DashboardContent>{children}</DashboardContent>
    </DashboardShell>
  );
}
