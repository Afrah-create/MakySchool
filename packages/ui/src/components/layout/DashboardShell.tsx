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
        {mobileChrome ? (
          <div className="relative z-40 shrink-0 lg:hidden">{mobileChrome}</div>
        ) : null}

        <div className="flex min-h-0 flex-1 overflow-hidden 2xl:gap-4">
          <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col">
            {topBar ? (
              <div className="relative z-40 hidden shrink-0 lg:block">{topBar}</div>
            ) : null}

            <div
              className={`dashboard-scroll relative z-0 min-h-0 flex-1 overflow-y-auto overscroll-contain ${scrollPadding}`}
            >
              {children}
            </div>
          </div>

          {/* Keep below overlays (SlideOver portals to body at z-200). Only on wide desktops. */}
          {rightRail ? (
            <div className="relative z-0 hidden h-full shrink-0 2xl:block">{rightRail}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
