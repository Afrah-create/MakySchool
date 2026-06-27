import type { ReactNode } from "react";
import { DashboardRightRail } from "@/components/layout/DashboardRightRail";
import { DashboardTopBar } from "@/components/layout/DashboardTopBar";
import { DashboardContent } from "@makyschool/ui/components/layout/DashboardContent";
import { DashboardShell } from "@makyschool/ui/components/layout/DashboardShell";

/** Shared dashboard chrome for school-admin, teacher, bursar, and learner portals. */
export function TenantDashboardShell({
  sidebar,
  header,
  children,
}: {
  sidebar: ReactNode;
  header?: ReactNode;
  children: ReactNode;
}) {
  return (
    <DashboardShell
      sidebar={sidebar}
      header={header}
      topBar={<DashboardTopBar />}
      rightRail={<DashboardRightRail />}
    >
      <DashboardContent>{children}</DashboardContent>
    </DashboardShell>
  );
}
