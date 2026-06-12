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
  { href: "/dashboard/classes", label: "Classes", icon: BookOpen, exact: false },
] as const;

export function TenantMobileNav({
  schoolName,
  schoolStatus,
}: {
  schoolName?: string | null;
  schoolStatus?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const billingEnabled = subscriptionsEnabled();

  const navLinks =
    schoolStatus === "setup"
      ? [{ href: "/dashboard/setup", label: "Setup", icon: LayoutDashboard, exact: false }]
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
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <header className="border-b border-theme bg-sidebar lg:hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-theme-accent text-xs font-bold text-on-accent">
            MS
          </span>
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
      <nav className="flex gap-1 overflow-x-auto px-4 pb-3">
        {navLinks.map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href, link.exact);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
                active
                  ? "bg-nav-active text-nav-active"
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
