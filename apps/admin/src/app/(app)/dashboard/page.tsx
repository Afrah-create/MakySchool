import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { SchoolsTable } from "@/components/schools/SchoolsTable";

export default function AdminDashboardPage() {
  return (
    <DashboardPage
      title="Schools"
      description="Provision and manage tenant schools"
    >
      <SchoolsTable />
    </DashboardPage>
  );
}
