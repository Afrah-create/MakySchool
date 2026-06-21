import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { SuperAdminsTable } from "@/components/admins/SuperAdminsTable";

export default function PlatformAdminsPage() {
  return (
    <DashboardPage
      title="Platform admins"
      description="Manage who can access the MakySchool platform dashboard"
    >
      <SuperAdminsTable />
    </DashboardPage>
  );
}
