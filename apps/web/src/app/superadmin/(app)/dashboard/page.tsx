import { SchoolsTable } from "@/components/superadmin/SchoolsTable";

export default function SuperAdminDashboardPage() {
  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-slate-500">
            Platform Overview
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">Schools</h1>
        </div>
        <SchoolsTable />
      </div>
    </main>
  );
}
