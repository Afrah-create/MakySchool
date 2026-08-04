"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { BrandLogo } from "@makyschool/ui/components/ui/BrandLogo";
import { ThemeToggle } from "@makyschool/ui/components/ui/ThemeToggle";
import { cn } from "@makyschool/ui/lib/cn";
import { AcademicYearTopSwitch } from "@/components/layout/AcademicYearTopSwitch";
import { DashboardHeaderSearch } from "@/components/layout/DashboardHeaderSearch";
import { DashboardNavProgress } from "@/components/layout/DashboardNavProgress";
import { useAuth } from "@/hooks/useAuth";
import { useSchool } from "@/providers/SchoolProvider";
import { performLogout } from "@/lib/auth/logout";
import { resolveMobilePageTitle } from "@/lib/roles/mobile-page-titles";
import { roleLabel } from "@/lib/users/display";

function SchoolMark({
  logoUrl,
}: {
  logoUrl?: string | null;
}) {
  if (logoUrl) {
    return (
      <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-theme bg-input">
        <Image src={logoUrl} alt="" fill className="object-contain p-0.5" unoptimized />
      </div>
    );
  }

  return <BrandLogo size={32} rounded="md" className="shrink-0" />;
}

export function DashboardTopBar() {
  const pathname = usePathname();
  const { state } = useAuth();
  const { school } = useSchool();
  const title = resolveMobilePageTitle(pathname);
  const user = state.user;
  const firstName = user?.name?.split(" ")[0] ?? null;
  const schoolName = school?.name ?? null;

  return (
    <header className="relative z-40 border-b border-theme bg-theme-surface/90 backdrop-blur-md">
      <DashboardNavProgress />
      <div className="flex h-14 items-center gap-3 px-4 sm:gap-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 shrink-0 items-center gap-3 lg:max-w-[14rem] xl:max-w-[16rem]">
          <SchoolMark logoUrl={school?.logo_url} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight text-theme-primary">
              {title}
            </p>
            <p className="truncate text-[11px] leading-tight text-theme-muted">
              {schoolName ?? "MakySchool"}
              {user?.role ? ` · ${roleLabel(user.role)}` : ""}
            </p>
          </div>
        </div>

        <DashboardHeaderSearch className="mx-auto hidden min-w-0 md:flex" />

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          <DashboardHeaderSearch variant="mobile" className="md:hidden" />
          <AcademicYearTopSwitch />
          {firstName ? (
            <div className="hidden items-center gap-2 xl:flex">
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full bg-theme-accent-muted text-xs font-semibold text-theme-accent",
                )}
                aria-hidden
              >
                {firstName.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-medium text-theme-primary">{firstName}</p>
                {user?.role ? (
                  <p className="truncate text-[11px] text-theme-muted">{roleLabel(user.role)}</p>
                ) : null}
              </div>
            </div>
          ) : null}

          <ThemeToggle />

          <button
            type="button"
            onClick={() => void performLogout("manual")}
            className="rounded-lg p-2 text-theme-muted transition hover:bg-nav-hover hover:text-theme-primary"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
