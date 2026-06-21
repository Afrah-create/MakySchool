"use client";

import Link from "next/link";
import { subscriptionsEnabled } from "@makyschool/shared/constants";
import { Badge } from "@makyschool/ui/components/ui/Badge";
import { useSchool } from "@/providers/SchoolProvider";

export function SubscriptionBanner() {
  const { school } = useSchool();

  if (!subscriptionsEnabled()) {
    return null;
  }

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
    <div className="ms-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-theme-muted">Subscription</p>
          <h2 className="mt-1 text-lg font-semibold text-theme-primary">{label}</h2>
        </div>
        <Badge tone={isActive ? "success" : "warning"}>{school.subscription_status}</Badge>
      </div>
      {!isActive ? (
        <p className="mt-3 text-sm text-theme-muted">
          <Link href="/dashboard/billing" className="font-medium text-theme-accent hover:underline">
            Payment instructions
          </Link>
        </p>
      ) : null}
    </div>
  );
}
