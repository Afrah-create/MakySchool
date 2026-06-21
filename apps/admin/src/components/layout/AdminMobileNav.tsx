"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { ThemeToggle } from "@makyschool/ui/components/ui/ThemeToggle";
import { apiClient } from "@/lib/api/client";
import { platformAdminNav } from "@/lib/platform-admin-nav";

export function AdminMobileNav() {
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    await apiClient("/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-theme bg-sidebar lg:hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-theme-accent text-xs font-bold text-on-accent">
            MS
          </span>
          <p className="truncate text-sm font-semibold text-theme-primary">MakySchool</p>
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
        {platformAdminNav.map((item) => {
          const Icon = item.icon;
          const active = item.isActive(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
                active
                  ? "bg-nav-active text-nav-active"
                  : "text-theme-muted hover:bg-nav-hover hover:text-theme-primary"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
