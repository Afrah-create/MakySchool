import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PortalMobileNav, PortalSidebar } from "@/components/layout/shared/PortalNav";
import { DashboardTopBar } from "@/components/layout/DashboardTopBar";
import { DashboardShell } from "@makyschool/ui/components/layout/DashboardShell";
import { getTenantPayloadFromCookies } from "@/lib/auth/server-tenant";
import { apiFetch } from "@/lib/api/server";
import { learnerNav, requirePortalSession } from "@/lib/roles";
import { getServerTenantContext } from "@/lib/tenant/server";
import { SchoolProvider } from "@/providers/SchoolProvider";
import type { SetupStatusResponse } from "@makyschool/shared/types";

export default async function LearnerPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerList = await headers();
  const tenant = await getServerTenantContext(headerList);
  const session = await getTenantPayloadFromCookies();

  if (!tenant?.schoolSlug) {
    redirect("/login");
  }

  requirePortalSession(session, "learner");

  let status: SetupStatusResponse | null = null;

  try {
    status = await apiFetch<SetupStatusResponse>("/schools/setup/status", {
      schoolSlug: tenant.schoolSlug,
    });
  } catch {
    status = null;
  }

  return (
    <SchoolProvider
      schoolSlug={tenant.schoolSlug}
      school={status?.school ?? null}
      setupStatus={status}
    >
      <DashboardShell
        sidebar={
          <PortalSidebar
            schoolName={status?.school?.name}
            role={session.role}
            navItems={learnerNav}
            portalLabel="Learner portal"
          />
        }
        header={
          <PortalMobileNav
            schoolName={status?.school?.name}
            role={session.role}
            navItems={learnerNav}
            portalLabel="Learner portal"
          />
        }
        topBar={<DashboardTopBar />}
      >
        {children}
      </DashboardShell>
    </SchoolProvider>
  );
}
