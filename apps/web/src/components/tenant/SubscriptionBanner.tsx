"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { useTenantSchool } from "@/providers/TenantSchoolProvider";

export function SubscriptionBanner() {
  const { school } = useTenantSchool();

  if (!school) {
    return null;
  }

  const isActive = school.subscription_status === "active";
  const bannerText = isActive
    ? `Active — ${school.subscription_term ?? "Term"} ${school.subscription_year ?? ""}`
    : "Subscription Expired — Renew Now";

  return (
    <div
      className={`rounded-3xl border px-5 py-4 shadow-sm ${
        isActive ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">Subscription</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">{bannerText}</h2>
        </div>
        <Badge tone={isActive ? "success" : "danger"}>{school.subscription_status}</Badge>
      </div>
      {!isActive ? (
        <p className="mt-3 text-sm text-slate-600">
          <Link href="/dashboard/billing" className="font-medium text-indigo-700 underline">
            View payment instructions
          </Link>{" "}
          to restore access.
        </p>
      ) : null}
    </div>
  );
}
