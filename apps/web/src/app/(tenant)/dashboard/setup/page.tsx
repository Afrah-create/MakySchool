import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { WizardShell } from "@/components/setup/WizardShell";
import { apiFetch } from "@/lib/api/server";
import { getServerTenantContext } from "@/lib/tenant/server";
import type { SetupStatusResponse } from "@makyschool/shared/types";

export default async function SetupPage() {
  const headerList = await headers();
  const tenant = await getServerTenantContext(headerList);

  if (!tenant?.schoolSlug) {
    redirect("/login");
  }

  let payload: SetupStatusResponse | null = null;

  try {
    payload = await apiFetch<SetupStatusResponse>("/schools/setup/status", {
      schoolSlug: tenant.schoolSlug,
    });
  } catch {
    payload = null;
  }

  if (payload?.completed) {
    redirect("/dashboard");
  }

  const schoolId = payload?.school?.id ?? tenant.schoolId;
  if (!schoolId) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-theme-page">
      <header className="border-b border-theme px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-theme-accent text-xs font-bold text-on-accent">
              MS
            </span>
            <div>
              <p className="text-sm font-semibold text-theme-primary">MakySchool</p>
              <p className="text-xs text-theme-muted">School setup</p>
            </div>
          </div>
          <span className="badge-info rounded-full px-2.5 py-1 font-mono text-xs">
            {tenant.schoolSlug}
          </span>
        </div>
      </header>

      <WizardShell
        school={payload?.school}
        schoolSlug={tenant.schoolSlug}
        schoolId={schoolId}
      />
    </div>
  );
}
