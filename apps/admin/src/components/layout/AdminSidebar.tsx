"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, School } from "lucide-react";
import { ThemeToggle } from "@makyschool/ui/components/ui/ThemeToggle";
import { apiClient } from "@/lib/api/client";


export function AdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const schoolsActive =
    pathname === "/dashboard" || pathname.startsWith("/schools");

  async function handleLogout() {
    await apiClient("/auth/logout", { method: "POST" });
    
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="hidden h-dvh w-72 shrink-0 flex-col border-r border-sidebar bg-sidebar p-6 lg:flex">
      <div className="mb-6 flex shrink-0 items-center gap-3 border-b border-theme pb-6">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-theme-accent text-xs font-bold text-on-accent">
          MS
        </span>
        <span className="text-sm font-semibold text-theme-primary">MakySchool</span>
      </div>

      <nav className="dashboard-scroll flex min-h-0 flex-1 flex-col space-y-1 overflow-y-auto overscroll-contain text-sm">
        <Link
          href="/dashboard"
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 font-medium transition ${
            schoolsActive
              ? "bg-nav-active text-nav-active"
              : "text-theme-muted hover:bg-nav-hover hover:text-theme-primary"
          }`}
        >
          <School className="h-4 w-4 shrink-0" />
          Schools
        </Link>
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
