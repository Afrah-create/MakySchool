"use client";

import { LogOut } from "lucide-react";
import { subscriptionsEnabled } from "@makyschool/shared/constants";
import type { UserRole } from "@makyschool/shared/types";
import { BrandLogo } from "@makyschool/ui/components/ui/BrandLogo";
import { performLogout } from "@/lib/auth/logout";
import { SchoolAdminSidebarNav } from "@/components/layout/school-admin/SchoolAdminNav";

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
  const billingEnabled = subscriptionsEnabled();

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
            <p className="truncate text-xs text-theme-muted">{schoolName ?? schoolSlug ?? "School"}</p>
          </div>
        </div>
      </div>

      <SchoolAdminSidebarNav
        role={role}
        setupMode={schoolStatus === "setup"}
        billingEnabled={billingEnabled}
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
