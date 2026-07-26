"use client";

import { LogOut } from "lucide-react";
import { BrandLogo } from "@makyschool/ui/components/ui/BrandLogo";
import { ThemeToggle } from "@makyschool/ui/components/ui/ThemeToggle";
import { DashboardNavProgress } from "@/components/layout/DashboardNavProgress";
import { performLogout } from "@/lib/auth/logout";
import { resolveMobilePageTitle } from "@/lib/roles/mobile-page-titles";
import { useOptionalSchool } from "@/providers/SchoolProvider";

export function MobileTopBar({
  schoolName,
  pathname,
}: {
  schoolName?: string | null;
  pathname: string;
}) {
  const schoolCtx = useOptionalSchool();
  const title = resolveMobilePageTitle(pathname);
  const resolvedSchoolName = schoolName?.trim() || schoolCtx?.school?.name || null;

  function handleLogout() {
    void performLogout("manual");
  }

  return (
    <header>
      <DashboardNavProgress />
      <div className="flex h-14 items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <BrandLogo size={30} rounded="md" className="shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight text-theme-primary">
              {title}
            </p>
            <p className="truncate text-[11px] leading-tight text-theme-muted">
              {resolvedSchoolName ?? "Your school"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="rounded-lg p-2 text-theme-muted transition hover:bg-nav-hover hover:text-theme-primary"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
