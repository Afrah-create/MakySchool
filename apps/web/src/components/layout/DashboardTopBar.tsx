"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Plus, Search } from "lucide-react";
import { can } from "@makyschool/shared/constants";
import { DashboardNavProgress } from "@/components/layout/DashboardNavProgress";
import { ThemeToggle } from "@makyschool/ui/components/ui/ThemeToggle";
import { useAuth } from "@/hooks/useAuth";
import { primaryActionPermission } from "@/lib/roles/dashboard-actions";

function searchPlaceholderForPath(pathname: string) {
  if (pathname.startsWith("/bursar")) {
    return "Search students or receipts…";
  }
  if (pathname.startsWith("/teacher")) {
    return "Search your classes…";
  }
  if (pathname.startsWith("/learner")) {
    return "Search your timetable…";
  }
  return "Search classes, students, teachers…";
}

function isPortalPath(pathname: string) {
  return (
    pathname.startsWith("/teacher") ||
    pathname.startsWith("/learner") ||
    pathname.startsWith("/bursar")
  );
}

type TopBarAction = {
  href: string;
  label: string;
} | null;

function primaryActionForPath(pathname: string): TopBarAction {
  if (pathname.startsWith("/dashboard/teaching-load")) {
    return null;
  }
  if (pathname.startsWith("/dashboard/teachers")) {
    return { href: "/dashboard/teachers?add=1", label: "Add teacher" };
  }
  if (pathname.startsWith("/dashboard/students")) {
    return { href: "/dashboard/students?add=1", label: "Add student" };
  }
  if (pathname.startsWith("/dashboard/users")) {
    return { href: "/dashboard/users?add=1", label: "Add user" };
  }
  if (pathname.startsWith("/dashboard/classes")) {
    return { href: "/dashboard/classes", label: "Add class" };
  }
  if (pathname.startsWith("/dashboard/fees")) {
    return { href: "/dashboard/fees/structures", label: "Add fee structure" };
  }
  if (pathname.startsWith("/dashboard/timetable")) {
    return { href: "/dashboard/timetable", label: "Edit timetable" };
  }
  if (pathname.startsWith("/dashboard/billing")) {
    return { href: "/dashboard/billing", label: "View billing" };
  }
  if (pathname === "/dashboard" || pathname === "/dashboard/") {
    return { href: "/dashboard/students?add=1", label: "Register student" };
  }
  return null;
}

export function DashboardTopBar() {
  const pathname = usePathname();
  const { state } = useAuth();
  const action = isPortalPath(pathname) ? null : primaryActionForPath(pathname);
  const actionPermission = action ? primaryActionPermission(pathname) : null;
  const canShowAction =
    action &&
    actionPermission &&
    state.user?.role &&
    can(state.user.role, actionPermission);

  return (
    <div className="relative border-b border-theme bg-theme-surface px-4 py-3 sm:px-6 lg:px-8">
      <DashboardNavProgress />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-muted" />
          <input
            type="search"
            placeholder={searchPlaceholderForPath(pathname)}
            className="ms-input w-full py-2.5 pl-10 pr-4"
            aria-label="Search dashboard"
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden lg:block">
            <ThemeToggle />
          </div>
          {canShowAction && action ? (
            <Link
              href={action.href}
              className="ms-btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 shadow-theme-accent"
            >
              <Plus className="h-4 w-4" />
              {action.label}
              <ChevronDown className="hidden h-4 w-4 opacity-70 sm:block" />
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
