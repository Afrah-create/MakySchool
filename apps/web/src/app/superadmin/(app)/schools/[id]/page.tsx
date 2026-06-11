import { notFound } from "next/navigation";
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
      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SchoolDetail {...data} />
        </div>
      </main>
    );
  } catch {
    notFound();
  }
}
