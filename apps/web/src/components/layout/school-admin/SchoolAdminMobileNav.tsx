"use client";

import { LogOut } from "lucide-react";
import { subscriptionsEnabled } from "@makyschool/shared/constants";
import type { UserRole } from "@makyschool/shared/types";
import { BrandLogo } from "@makyschool/ui/components/ui/BrandLogo";
import { ThemeToggle } from "@makyschool/ui/components/ui/ThemeToggle";
import { performLogout } from "@/lib/auth/logout";
import { SchoolAdminMobileNavLinks } from "@/components/layout/school-admin/SchoolAdminNav";

export function SchoolAdminMobileNav({
  schoolName,
  schoolStatus,
  role,
}: {
  schoolName?: string | null;
  schoolStatus?: string;
  role: UserRole;
}) {
  const billingEnabled = subscriptionsEnabled();

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
      <SchoolAdminMobileNavLinks
        role={role}
        setupMode={schoolStatus === "setup"}
        billingEnabled={billingEnabled}
      />
    </header>
  );
}
