import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardRightRail } from "@/components/layout/DashboardRightRail";
import { SchoolAdminMobileNav } from "@/components/layout/school-admin/SchoolAdminMobileNav";
import { SchoolAdminSidebar } from "@/components/layout/school-admin/SchoolAdminSidebar";
import { DashboardTopBar } from "@/components/layout/DashboardTopBar";
import { SubscriptionLockout } from "@/components/school-admin/SubscriptionLockout";
import { subscriptionsEnabled } from "@makyschool/shared/constants";
import { DashboardShell } from "@makyschool/ui/components/layout/DashboardShell";
import { getTenantPayloadFromCookies } from "@/lib/auth/server-tenant";
import { apiFetch } from "@/lib/api/server";
import { requirePortalSession } from "@/lib/roles";
import { getServerTenantContext } from "@/lib/tenant/server";
import { SchoolProvider } from "@/providers/SchoolProvider";
import type { SetupStatusResponse } from "@makyschool/shared/types";

export default async function SchoolAdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerList = await headers();
  const tenant = await getServerTenantContext(headerList);
  const session = await getTenantPayloadFromCookies();
  const isSetupWizard = headerList.get("x-makyschool-setup") === "1";

  if (!tenant?.schoolSlug) {
    redirect("/login");
  }

  requirePortalSession(session, "school-admin");

  let status: SetupStatusResponse | null = null;

  try {
    status = await apiFetch<SetupStatusResponse>("/schools/setup/status", {
      schoolSlug: tenant.schoolSlug,
    });
  } catch {
    status = null;
  }

  if (isSetupWizard) {
    return (
      <SchoolProvider
        schoolSlug={tenant.schoolSlug}
        school={status?.school ?? null}
        setupStatus={status}
      >
        {children}
      </SchoolProvider>
    );
  }

  return (
    <SchoolProvider
      schoolSlug={tenant.schoolSlug}
      school={status?.school ?? null}
      setupStatus={status}
    >
      <DashboardShell
        sidebar={
          <SchoolAdminSidebar
            schoolSlug={tenant.schoolSlug}
            schoolStatus={status?.school?.status}
            schoolName={status?.school?.name}
            role={session.role}
          />
        }
        header={
          <SchoolAdminMobileNav
            schoolName={status?.school?.name}
            schoolStatus={status?.school?.status}
            role={session.role}
          />
        }
        topBar={<DashboardTopBar />}
        rightRail={<DashboardRightRail />}
      >
        {children}
        {subscriptionsEnabled() ? <SubscriptionLockout /> : null}
      </DashboardShell>
    </SchoolProvider>
  );
}
