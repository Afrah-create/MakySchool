"use client";


import { LogOut } from "lucide-react";
import { useMemo } from "react";
import type { UserRole } from "@makyschool/shared/types";
import { BrandLogo } from "@makyschool/ui/components/ui/BrandLogo";
import { ThemeToggle } from "@makyschool/ui/components/ui/ThemeToggle";
import {
  GroupedMobileNavLinks,
  GroupedSidebarNav,
} from "@/components/layout/shared/GroupedSidebarNav";
import { performLogout } from "@/lib/auth/logout";
import { isBursarFeesPath } from "@/lib/roles/fees-nav";
import {
  filterPortalNavGroupsByRole,
  portalGroupsToGrouped,
  type PortalNavGroup,
} from "@/lib/roles/portal-nav";

type PortalNavProps = {
  schoolName?: string | null;
  role: UserRole;
  navGroups: PortalNavGroup[];
  storagePrefix: string;
};

function useGroupedPortalNav(navGroups: PortalNavGroup[], role: UserRole) {
  return useMemo(
    () => portalGroupsToGrouped(filterPortalNavGroupsByRole(navGroups, role)),
    [navGroups, role],
  );
}

export function PortalMobileNav({ schoolName, role, navGroups }: PortalNavProps) {
  const groups = useGroupedPortalNav(navGroups, role);

  function handleLogout() {
    void performLogout("manual");
  }

  return (
    <header className="border-b border-theme bg-sidebar">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandLogo size={32} rounded="md" />
          <p className="truncate text-sm font-semibold text-theme-primary">
            {schoolName ?? "Your school"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
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
      <GroupedMobileNavLinks groups={groups} />
    </header>
  );
}

export function PortalSidebar({ schoolName, role, navGroups, storagePrefix }: PortalNavProps) {
  const groups = useGroupedPortalNav(navGroups, role);

  function handleLogout() {
    void performLogout("manual");
  }

  return (
    <aside className="hidden h-dvh w-64 shrink-0 flex-col overflow-hidden border-r border-sidebar bg-sidebar px-4 py-6 lg:flex">
      <div className="mb-6 shrink-0 px-2">
        <div className="flex items-center gap-3">
          <BrandLogo size={36} className="shadow-theme-accent" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-theme-primary">MakySchool</p>
            <p className="truncate text-xs text-theme-muted">{schoolName ?? "School"}</p>
          </div>
        </div>
      </div>

      <GroupedSidebarNav
        groups={groups}
        storagePrefix={storagePrefix}
        expandItemWhen={(pathname) =>
          storagePrefix === "portal-bursar" && isBursarFeesPath(pathname)
            ? ["/bursar/dashboard"]
            : []
        }
      />

      <div className="mt-auto shrink-0 px-1 pt-6">
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-theme-muted transition hover:bg-nav-hover hover:text-theme-primary"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
