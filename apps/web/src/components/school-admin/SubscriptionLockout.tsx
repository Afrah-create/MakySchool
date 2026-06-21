"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { subscriptionsEnabled } from "@makyschool/shared/constants";
import { useSchool } from "@/providers/SchoolProvider";

export function SubscriptionLockout() {
  const pathname = usePathname();
  const { school } = useSchool();

  if (!subscriptionsEnabled()) {
    return null;
  }

  if (!school || school.status === "setup") {
    return null;
  }

  const needsPayment = school.subscription_status === "unpaid" || school.subscription_status === "expired";

  if (!needsPayment) {
    return null;
  }

  if (pathname.startsWith("/dashboard/billing") || pathname.startsWith("/dashboard/setup")) {
    return null;
  }

  const title = school.subscription_status === "expired" ? "Subscription expired" : "Payment required";

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-theme-overlay px-4">
      <div className="max-w-md rounded-2xl border border-theme bg-theme-surface p-8 text-center">
        <h2 className="text-xl font-semibold text-theme-primary">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-theme-muted">
          Your subscription for {school.subscription_term ?? "the current term"}{" "}
          {school.subscription_year ?? new Date().getFullYear()} is due. Pay with Mobile Money to restore
          access.
        </p>
        <Link href="/dashboard/billing" className="mt-6 inline-flex ms-btn-primary px-5 py-2.5">
          Pay with Mobile Money
        </Link>
      </div>
    </div>
  );
}
