"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api/client";

export function SuperAdminSidebar() {
  const router = useRouter();

  async function handleLogout() {
    await apiClient("/superadmin/auth/logout", { method: "POST" });
    router.push("/superadmin/login");
    router.refresh();
  }

  return (
    <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white/90 p-6 shadow-sm lg:flex lg:flex-col">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-700">MakySchool</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Super Admin</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          School provisioning, subscriptions, and platform oversight.
        </p>
      </div>
      <nav className="mt-10 flex flex-1 flex-col space-y-2 text-sm">
        <Link
          href="/superadmin/dashboard"
          className="block rounded-2xl bg-indigo-700 px-4 py-3 font-medium text-white"
        >
          Dashboard
        </Link>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="block rounded-2xl px-4 py-3 text-left font-medium text-slate-700 transition hover:bg-slate-100"
        >
          Sign out
        </button>
      </nav>
    </aside>
  );
}
