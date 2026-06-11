import { DashboardShell } from "@/components/layout/DashboardShell";
import { SuperAdminSidebar } from "@/components/layout/SuperAdminSidebar";

export default function SuperAdminAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardShell sidebar={<SuperAdminSidebar />}>
      <div className="flex-1">{children}</div>
    </DashboardShell>
  );
}
