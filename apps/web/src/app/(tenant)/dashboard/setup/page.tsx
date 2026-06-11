import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { WizardShell } from "@/components/setup/WizardShell";
import { apiFetch } from "@/lib/api/server";
import { getTenantFromHeaders } from "@/lib/tenant/server";
import type { SetupStatusResponse } from "@makyschool/shared/types";

export default async function SetupPage() {
  const headerList = await headers();
  const tenant = getTenantFromHeaders(headerList);

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

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <WizardShell school={payload?.school} schoolSlug={tenant.schoolSlug} />
      </div>
    </main>
  );
}
