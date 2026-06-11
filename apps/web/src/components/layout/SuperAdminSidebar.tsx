"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, School } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { clearSchoolSlug } from "@/lib/auth/session";

export function SuperAdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const schoolsActive =
    pathname === "/superadmin/dashboard" || pathname.startsWith("/superadmin/schools");

  async function handleLogout() {
    await apiClient("/auth/logout", { method: "POST" });
    clearSchoolSlug();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="hidden min-h-screen w-72 shrink-0 flex-col border-r border-[#252A3A] bg-[#181C27] p-6 lg:flex">
      <div className="mb-6 flex items-center gap-3 border-b border-[#252A3A] pb-6">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#4F6EF7] text-xs font-bold text-white">
          MS
        </span>
        <span className="text-sm font-semibold text-[#F0F2FA]">MakySchool</span>
      </div>

      <nav className="flex flex-1 flex-col space-y-1 text-sm">
        <Link
          href="/superadmin/dashboard"
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 font-medium transition ${
            schoolsActive
              ? "bg-[#1E2A5E] text-[#4F6EF7]"
              : "text-[#8B90A7] hover:bg-[#252A3A] hover:text-[#F0F2FA]"
          }`}
        >
          <School className="h-4 w-4 shrink-0" />
          Schools
        </Link>
      </nav>

      <div className="mt-auto pt-6">
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-[#8B90A7] transition hover:text-[#F0F2FA]"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
        <p className="mt-4 px-3 text-[10px] text-[#3D4357]">MakySchool v1.0</p>
      </div>
    </aside>
  );
}
