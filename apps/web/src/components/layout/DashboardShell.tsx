import type { ReactNode } from "react";

export function DashboardShell({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return <div className="min-h-screen lg:flex">{sidebar}{children}</div>;
}