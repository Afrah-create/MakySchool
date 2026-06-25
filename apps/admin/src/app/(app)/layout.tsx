import { DashboardShell } from "@makyschool/ui/components/layout/DashboardShell";
import { AdminMobileNav } from "@/components/layout/AdminMobileNav";
import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { SessionManager } from "@/components/session/SessionManager";

export default function AdminAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardShell sidebar={<AdminSidebar />} header={<AdminMobileNav />}>
      <SessionManager />
      {children}
    </DashboardShell>
  );
}
