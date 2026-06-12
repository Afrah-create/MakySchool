import { DashboardShell } from "@/components/layout/DashboardShell";
import { SuperAdminMobileNav } from "@/components/layout/SuperAdminMobileNav";
import { SuperAdminSidebar } from "@/components/layout/SuperAdminSidebar";

export default function SuperAdminAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardShell sidebar={<SuperAdminSidebar />} header={<SuperAdminMobileNav />}>
      {children}
    </DashboardShell>
  );
}
