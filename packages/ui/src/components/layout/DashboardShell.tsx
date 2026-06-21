import type { ReactNode } from "react";

export function DashboardShell({
  sidebar,
  header,
  topBar,
  rightRail,
  children,
}: {
  sidebar: ReactNode;
  header?: ReactNode;
  topBar?: ReactNode;
  rightRail?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-dvh overflow-hidden bg-theme-page text-theme-primary">
      {sidebar}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {header ? <div className="shrink-0 lg:hidden">{header}</div> : null}

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {topBar ? <div className="shrink-0">{topBar}</div> : null}

            <div className="dashboard-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {children}
            </div>
          </div>

          {rightRail ? (
            <aside className="dashboard-scroll hidden w-80 shrink-0 overflow-y-auto border-l border-theme bg-theme-surface xl:block">
              {rightRail}
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}
