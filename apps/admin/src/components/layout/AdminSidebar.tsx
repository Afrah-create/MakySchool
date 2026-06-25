"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { BrandLogo } from "@makyschool/ui/components/ui/BrandLogo";
import { ThemeToggle } from "@makyschool/ui/components/ui/ThemeToggle";
import { performLogout } from "@/lib/auth/logout";
import { platformAdminNav } from "@/lib/platform-admin-nav";

export function AdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();

  function handleLogout() {
    void performLogout("manual");
  }

  return (
    <aside className="hidden h-dvh w-72 shrink-0 flex-col border-r border-sidebar bg-sidebar p-6 lg:flex">
      <div className="mb-6 flex shrink-0 items-center gap-3 border-b border-theme pb-6">
        <BrandLogo size={32} rounded="md" />
        <span className="text-sm font-semibold text-theme-primary">MakySchool</span>
      </div>

      <nav className="dashboard-scroll flex min-h-0 flex-1 flex-col space-y-1 overflow-y-auto overscroll-contain text-sm">
        {platformAdminNav.map((item) => {
          const Icon = item.icon;
          const active = item.isActive(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 font-medium transition ${
                active
                  ? "bg-nav-active text-nav-active"
                  : "text-theme-muted hover:bg-nav-hover hover:text-theme-primary"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
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
        <p className="px-3 text-[10px] text-theme-faint">MakySchool v1.0</p>
      </div>
    </aside>
  );
}
