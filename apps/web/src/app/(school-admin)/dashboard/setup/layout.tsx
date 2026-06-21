import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { apiFetch } from "@/lib/api/server";
import { getServerTenantContext } from "@/lib/tenant/server";

export default async function SetupLayout({
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
    const payload = await apiFetch<{ completed: boolean }>("/schools/setup/status", {
      schoolSlug: tenant.schoolSlug,
    });

    if (payload.completed) {
      redirect("/dashboard");
    }
  } catch {
    // Allow setup flow when status cannot be loaded yet.
  }

  return <>{children}</>;
}
