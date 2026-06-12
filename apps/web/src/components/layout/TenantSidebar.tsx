"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, CreditCard, LayoutDashboard, LogOut } from "lucide-react";
import { subscriptionsEnabled } from "@makyschool/shared/constants";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { apiClient } from "@/lib/api/client";
import { clearSchoolSlug } from "@/lib/auth/session";

const baseLinks = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/classes", label: "Classes & subjects", icon: BookOpen, exact: false },
] as const;

export function TenantSidebar({
  schoolSlug,
  schoolStatus,
  schoolName,
}: {
  schoolSlug?: string;
  schoolStatus?: string;
  schoolName?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const billingEnabled = subscriptionsEnabled();

  const navLinks =
    schoolStatus === "setup"
      ? [{ href: "/dashboard/setup", label: "Setup wizard", icon: LayoutDashboard, exact: false }]
      : [
          ...baseLinks,
          ...(billingEnabled
            ? [{ href: "/dashboard/billing", label: "Billing", icon: CreditCard, exact: false } as const]
            : []),
        ];

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
    <aside className="hidden h-dvh w-72 shrink-0 flex-col border-r border-sidebar bg-sidebar p-6 lg:flex">
      <div className="mb-6 shrink-0 border-b border-theme pb-6">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-theme-accent text-xs font-bold text-on-accent">
            MS
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-theme-primary">
              {schoolName ?? "Your school"}
            </p>
            <p className="truncate text-xs text-theme-muted">{schoolSlug ?? "school"}</p>
          </div>
        </div>
      </div>

      <nav className="dashboard-scroll flex min-h-0 flex-1 flex-col space-y-1 overflow-y-auto overscroll-contain text-sm">
        {navLinks.map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href, link.exact);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 font-medium transition ${
                active
                  ? "bg-nav-active text-nav-active"
                  : "text-theme-muted hover:bg-nav-hover hover:text-theme-primary"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto shrink-0 space-y-2 pt-6">
        <div className="flex items-center gap-2 px-3">
          <ThemeToggle />
          <span className="text-xs text-theme-faint">Theme</span>
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-theme-muted transition hover:text-theme-primary"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
