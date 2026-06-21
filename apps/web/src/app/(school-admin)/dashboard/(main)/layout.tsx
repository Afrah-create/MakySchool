import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { apiFetch } from "@/lib/api/server";
import { getServerTenantContext } from "@/lib/tenant/server";

export default async function ActiveDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerList = await headers();
  const tenant = await getServerTenantContext(headerList);

  if (!tenant?.schoolSlug) {
    redirect("/login");
  }

  try {
    const payload = await apiFetch<{ school: { status: string } | null; completed: boolean }>(
      "/schools/setup/status",
      { schoolSlug: tenant.schoolSlug },
    );

    if (payload.completed === false) {
      redirect("/dashboard/setup");
    }
  } catch {
    redirect("/dashboard/setup");
  }

  return <>{children}</>;
}
