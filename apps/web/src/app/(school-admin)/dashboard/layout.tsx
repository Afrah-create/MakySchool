import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SchoolAdminMobileNav } from "@/components/layout/school-admin/SchoolAdminMobileNav";
import { SchoolAdminSidebar } from "@/components/layout/school-admin/SchoolAdminSidebar";
import { TenantDashboardShell } from "@/components/layout/TenantDashboardShell";
import { SubscriptionLockout } from "@/components/school-admin/SubscriptionLockout";
import { SessionManager } from "@/components/session/SessionManager";
import { subscriptionsEnabled } from "@makyschool/shared/constants";
import { getTenantPayloadFromCookies } from "@/lib/auth/server-tenant";
import { apiFetch } from "@/lib/api/server";
import { requirePortalSession } from "@/lib/roles";
import { getServerTenantContext } from "@/lib/tenant/server";
import { SchoolProvider } from "@/providers/SchoolProvider";
import { PortalRoleProvider } from "@/providers/PortalRoleProvider";
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
      <PortalRoleProvider role={session.role}>
        <SchoolProvider
          schoolSlug={tenant.schoolSlug}
          school={status?.school ?? null}
          setupStatus={status}
        >
          <SessionManager />
          {children}
        </SchoolProvider>
      </PortalRoleProvider>
    );
  }

  return (
    <PortalRoleProvider role={session.role}>
      <SchoolProvider
        schoolSlug={tenant.schoolSlug}
        school={status?.school ?? null}
        setupStatus={status}
      >
        <TenantDashboardShell
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
      >
          <SessionManager />
          {children}
          {subscriptionsEnabled() ? <SubscriptionLockout /> : null}
      </TenantDashboardShell>
      </SchoolProvider>
    </PortalRoleProvider>
  );
}
