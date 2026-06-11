import type { ReactNode } from "react";
import { theme } from "@/lib/theme";

export function DashboardShell({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`${theme.page} min-h-screen lg:flex`}>
      {sidebar}
      {children}
    </div>
  );
}
