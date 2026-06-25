"use client";

import { DashboardNavProgress } from "@/components/layout/DashboardNavProgress";
import { ThemeToggle } from "@makyschool/ui/components/ui/ThemeToggle";

export function DashboardTopBar() {
  return (
    <div className="relative border-b border-theme bg-theme-surface">
      <DashboardNavProgress />
      <div className="flex h-11 items-center justify-end px-4 sm:px-6 lg:px-8">
        <div className="hidden lg:block">
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
