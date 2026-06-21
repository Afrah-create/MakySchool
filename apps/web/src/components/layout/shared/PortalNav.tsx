"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import type { UserRole } from "@makyschool/shared/types";
import { ThemeToggle } from "@makyschool/ui/components/ui/ThemeToggle";
import { apiClient } from "@/lib/api/client";
import { clearSchoolSlug } from "@/lib/auth/session";
import { filterNavByRole, type NavItem } from "@/lib/roles";

type PortalNavProps = {
  schoolName?: string | null;
  role: UserRole;
  navItems: NavItem[];
  portalLabel: string;
};

export function PortalMobileNav({
  schoolName,
  role,
  navItems,
  portalLabel,
}: PortalNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const links = filterNavByRole(navItems, role);

  async function handleLogout() {
    await apiClient("/auth/logout", { method: "POST" });
    clearSchoolSlug();
    router.push("/login");
    router.refresh();
  }

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <header className="border-b border-theme bg-sidebar">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-theme-accent text-xs font-bold text-on-accent">
            MS
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-theme-primary">
              {schoolName ?? "Your school"}
            </p>
            <p className="truncate text-xs text-theme-muted">{portalLabel}</p>
          </div>
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
      <nav className="flex gap-1 overflow-x-auto px-4 pb-3">
        {links.map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href, link.exact);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition ${
                active
                  ? "bg-theme-accent text-on-accent"
                  : "text-theme-muted hover:bg-nav-hover hover:text-theme-primary"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

export function PortalSidebar({
  schoolName,
  role,
  navItems,
  portalLabel,
}: PortalNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const links = filterNavByRole(navItems, role);

  async function handleLogout() {
    await apiClient("/auth/logout", { method: "POST" });
    clearSchoolSlug();
    router.push("/login");
    router.refresh();
  }

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside className="hidden h-dvh w-64 shrink-0 flex-col border-r border-sidebar bg-sidebar px-4 py-6 lg:flex">
      <div className="mb-8 shrink-0 px-2">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-theme-accent text-sm font-bold text-on-accent shadow-theme-accent">
            MS
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-theme-primary">MakySchool</p>
            <p className="truncate text-xs text-theme-muted">{schoolName ?? "School"}</p>
            <p className="truncate text-[11px] text-theme-faint">{portalLabel}</p>
          </div>
        </div>
      </div>

      <nav className="dashboard-scroll flex min-h-0 flex-1 flex-col space-y-1 overflow-y-auto overscroll-contain px-1 text-sm">
        {links.map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href, link.exact);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium transition ${
                active
                  ? "bg-theme-accent text-on-accent shadow-theme-accent"
                  : "text-theme-muted hover:bg-nav-hover hover:text-theme-primary"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {link.label}
            </Link>
          );
        })}
      </nav>

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
