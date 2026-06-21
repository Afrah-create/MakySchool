"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Plus, Search } from "lucide-react";
import { DashboardNavProgress } from "@/components/layout/DashboardNavProgress";
import { ThemeToggle } from "@makyschool/ui/components/ui/ThemeToggle";

function primaryActionForPath(pathname: string) {
  if (pathname.startsWith("/dashboard/classes")) {
    return { href: "/dashboard/classes", label: "Add class" };
  }
  if (pathname.startsWith("/dashboard/billing")) {
    return { href: "/dashboard/billing", label: "View billing" };
  }
  return { href: "/dashboard/classes", label: "Add class" };
}

export function DashboardTopBar() {
  const pathname = usePathname();
  const action = primaryActionForPath(pathname);

  return (
    <div className="relative border-b border-theme bg-theme-surface px-4 py-3 sm:px-6 lg:px-8">
      <DashboardNavProgress />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-muted" />
          <input
            type="search"
            placeholder="Search classes, subjects…"
            className="ms-input w-full py-2.5 pl-10 pr-4"
            aria-label="Search dashboard"
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden lg:block">
            <ThemeToggle />
          </div>
          <Link
            href={action.href}
            className="ms-btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 shadow-theme-accent"
          >
            <Plus className="h-4 w-4" />
            {action.label}
            <ChevronDown className="hidden h-4 w-4 opacity-70 sm:block" />
          </Link>
        </div>
      </div>
    </div>
  );
}
