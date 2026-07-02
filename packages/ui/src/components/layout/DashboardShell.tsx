import type { ReactNode } from "react";

export function DashboardShell({
  sidebar,
  mobileChrome,
  mobileBottomInset = false,
  topBar,
  rightRail,
  children,
}: {
  sidebar: ReactNode;
  /** Top + bottom mobile navigation (`lg:hidden`). */
  mobileChrome?: ReactNode;
  /** Reserve space for a fixed mobile bottom tab bar. */
  mobileBottomInset?: boolean;
  topBar?: ReactNode;
  rightRail?: ReactNode;
  children: ReactNode;
}) {
  const scrollPadding = mobileBottomInset
    ? "pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] lg:pb-0"
    : "";

  return (
    <div className="flex h-dvh overflow-hidden bg-theme-page text-theme-primary">
      {sidebar}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {mobileChrome ? <div className="shrink-0 lg:hidden">{mobileChrome}</div> : null}

        <div className="flex min-h-0 flex-1 overflow-hidden xl:gap-4">
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            {topBar ? <div className="hidden shrink-0 lg:block">{topBar}</div> : null}

            <div
              className={`dashboard-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain ${scrollPadding}`}
            >
              {children}
            </div>
          </div>

          {rightRail ? (
            <div className="hidden h-full shrink-0 xl:block">{rightRail}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
