import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { apiFetch } from "@/lib/api/server";
import { getTenantFromHeaders } from "@/lib/tenant/server";

export default async function ActiveDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerList = await headers();
  const tenant = getTenantFromHeaders(headerList);

  if (!tenant?.schoolSlug) {
    redirect("/login");
  }

  try {
    const payload = await apiFetch<{ school: { status: string } | null }>(
      "/schools/setup/status",
      { schoolSlug: tenant.schoolSlug },
    );
    const school = payload.school;

    if (!school || school.status === "setup") {
      redirect("/dashboard/setup");
    }
  } catch {
    redirect("/dashboard/setup");
  }

  return <>{children}</>;
}
