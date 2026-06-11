"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { theme } from "@/lib/theme";
import { useTenantSchool } from "@/providers/TenantSchoolProvider";

export function SubscriptionBanner() {
  const { school } = useTenantSchool();

  if (!school || school.status === "setup") {
    return null;
  }

  const isActive = school.subscription_status === "active";
  const label = isActive
    ? `${school.subscription_term ?? "Term"} ${school.subscription_year ?? ""}`
    : school.subscription_status === "unpaid"
      ? "Payment pending"
      : "Renew subscription";

  return (
    <div className={`${theme.panel} ${theme.panelPadding}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={`text-sm ${theme.muted}`}>Subscription</p>
          <h2 className={`mt-1 text-lg font-semibold ${theme.heading}`}>{label}</h2>
        </div>
        <Badge tone={isActive ? "success" : "warning"}>{school.subscription_status}</Badge>
      </div>
      {!isActive ? (
        <p className={`mt-3 text-sm ${theme.muted}`}>
          <Link href="/dashboard/billing" className="font-medium text-[#4F6EF7] hover:underline">
            Payment instructions
          </Link>
        </p>
      ) : null}
    </div>
  );
}
