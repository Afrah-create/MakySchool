"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { subscriptionsEnabled } from "@makyschool/shared/constants";
import type { UserRole } from "@makyschool/shared/types";
import { apiClient } from "@/lib/api/client";
import { clearSchoolSlug } from "@/lib/auth/session";
import {
  filterNavByRole,
  schoolAdminNav,
  schoolAdminSetupNav,
} from "@/lib/roles";

export function SchoolAdminSidebar({
  schoolSlug,
  schoolStatus,
  schoolName,
  role,
}: {
  schoolSlug?: string;
  schoolStatus?: string;
  schoolName?: string | null;
  role: UserRole;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const billingEnabled = subscriptionsEnabled();

  const navLinks =
    schoolStatus === "setup"
      ? filterNavByRole(schoolAdminSetupNav, role)
      : filterNavByRole(schoolAdminNav, role).filter(
          (link) => link.href !== "/dashboard/billing" || billingEnabled,
        );

  async function handleLogout() {
    await apiClient("/auth/logout", { method: "POST" });
    clearSchoolSlug();
    router.push("/login");
    router.refresh();
  }

  function isActive(href: string, exact: boolean) {
    if (exact) {
      return pathname === href;
    }
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
            <p className="truncate text-xs text-theme-muted">{schoolName ?? schoolSlug ?? "School"}</p>
          </div>
        </div>
      </div>

      <nav className="dashboard-scroll flex min-h-0 flex-1 flex-col space-y-1 overflow-y-auto overscroll-contain px-1 text-sm">
        {navLinks.map((link) => {
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
