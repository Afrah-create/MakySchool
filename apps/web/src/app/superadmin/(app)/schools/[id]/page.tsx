import { notFound } from "next/navigation";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { SchoolDetail } from "@/components/superadmin/SchoolDetail";
import { apiFetch } from "@/lib/api/server";

export default async function SchoolDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const data = await apiFetch<{
      school: Parameters<typeof SchoolDetail>[0]["school"];
      subscriptionHistory: Parameters<typeof SchoolDetail>[0]["subscriptionHistory"];
      counts: Parameters<typeof SchoolDetail>[0]["counts"];
      setupStatus?: Parameters<typeof SchoolDetail>[0]["setupStatus"];
    }>(`/superadmin/schools/${id}`);

    return (
      <DashboardPage
        eyebrow="Schools"
        title={data.school.name ?? "Unnamed school"}
        description={`${data.school.slug}.makyschool.com`}
      >
        <SchoolDetail {...data} />
      </DashboardPage>
    );
  } catch {
    notFound();
  }
}
