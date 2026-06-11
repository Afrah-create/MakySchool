"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTenantSchool } from "@/providers/TenantSchoolProvider";

export function SubscriptionLockout() {
  const pathname = usePathname();
  const { school } = useTenantSchool();

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
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#0F1117]/90 px-4">
      <div className="max-w-md rounded-2xl border border-[#252A3A] bg-[#181C27] p-8 text-center">
        <h2 className="text-xl font-semibold text-[#F0F2FA]">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-[#8B90A7]">
          Pay UGX 300,000 for {school.subscription_term ?? "the current term"}{" "}
          {school.subscription_year ?? new Date().getFullYear()} via SchoolPay to restore access.
        </p>
        <Link href="/dashboard/billing" className="mt-6 inline-flex rounded-lg bg-[#4F6EF7] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#3D5CE6]">
          View payment details
        </Link>
      </div>
    </div>
  );
}
