import { DashboardPage } from "@/components/layout/DashboardPage";
import { SchoolsTable } from "@/components/superadmin/SchoolsTable";

export default function SuperAdminDashboardPage() {
  return (
    <DashboardPage
      title="Schools"
      description="Provision and manage tenant schools"
    >
      <SchoolsTable />
    </DashboardPage>
  );
}
