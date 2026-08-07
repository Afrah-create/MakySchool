import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PortalShell } from "@/components/layout/shared/PortalShell";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { NotificationDrawer } from "@/components/notifications/NotificationDrawer";
import { SessionManager } from "@/components/session/SessionManager";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { getTenantPayloadFromCookies } from "@/lib/auth/server-tenant";
import { apiFetch } from "@/lib/api/server";
import { requirePortalSession } from "@/lib/roles";
import { getServerTenantContext } from "@/lib/tenant/server";
import { SchoolProvider } from "@/providers/SchoolProvider";
import { PortalRoleProvider } from "@/providers/PortalRoleProvider";
import type { SetupStatusResponse } from "@makyschool/shared/types";

export default async function BursarPortalLayout({
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

  requirePortalSession(session, "bursar");

  let status: SetupStatusResponse | null = null;

  try {
    status = await apiFetch<SetupStatusResponse>("/schools/setup/status", {
      schoolSlug: tenant.schoolSlug,
    });
  } catch {
    status = null;
  }

  return (
    <PortalRoleProvider role={session.role}>
      <SchoolProvider
        schoolSlug={tenant.schoolSlug}
        school={status?.school ?? null}
        setupStatus={status}
      >
        <NotificationProvider>
          <PortalShell
            schoolName={status?.school?.name}
            role={session.role}
            portal="bursar"
          >
            <SessionManager />
            {children}
          </PortalShell>
          <NotificationDrawer userRole={session.role} />
        </NotificationProvider>
      </SchoolProvider>
    </PortalRoleProvider>
  );
}
