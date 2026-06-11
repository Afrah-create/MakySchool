import { SchoolsTable } from "@/components/superadmin/SchoolsTable";

export default function SuperAdminDashboardPage() {
  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[#F0F2FA]">Schools</h1>
            <p className="mt-0.5 text-sm text-[#8B90A7]">Provision and manage tenant schools</p>
          </div>
        </div>
        <SchoolsTable />
      </div>
    </main>
  );
}
