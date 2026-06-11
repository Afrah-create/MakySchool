"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTenantSchool } from "@/providers/TenantSchoolProvider";

export function SubscriptionLockout() {
  const pathname = usePathname();
  const { school } = useTenantSchool();

  if (!school || school.subscription_status !== "expired") {
    return null;
  }

  if (pathname.startsWith("/dashboard/billing")) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/65 px-4">
      <div className="max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-2xl">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">
          Subscription Expired
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-slate-900">Renew to restore access</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Pay the SchoolPay reference for {school.subscription_term ?? "the active term"}{" "}
          {school.subscription_year ?? ""} to continue using the dashboard.
        </p>
        <Link
          href="/dashboard/billing"
          className="mt-6 inline-flex rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-medium text-white"
        >
          View payment instructions
        </Link>
      </div>
    </div>
  );
}
