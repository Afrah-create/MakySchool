import type { ReactNode } from "react";

export function DashboardShell({
  sidebar,
  header,
  children,
}: {
  sidebar: ReactNode;
  header?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-dvh overflow-hidden bg-theme-page text-theme-primary">
      {sidebar}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {header ? <div className="shrink-0">{header}</div> : null}

        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
