import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTenantPayloadFromCookies } from "@/lib/auth/server-tenant";
import { requirePortalSession } from "@/lib/roles";
import { getServerTenantContext } from "@/lib/tenant/server";
import { SchoolProvider } from "@/providers/SchoolProvider";
import { SessionManager } from "@/components/session/SessionManager";
import { apiFetch } from "@/lib/api/server";
import type { SetupStatusResponse } from "@makyschool/shared/types";

export default async function PrintLayout({
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

  requirePortalSession(session, "school-admin");

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
      <div className="min-h-screen bg-theme-bg text-theme-primary print:bg-white">
        <SessionManager />
        {children}
      </div>
    </SchoolProvider>
  );
}
