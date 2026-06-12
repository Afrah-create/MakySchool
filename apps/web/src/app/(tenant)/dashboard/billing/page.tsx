import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SUBSCRIPTION_FEE_UGX } from "@makyschool/shared/constants";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { apiFetch } from "@/lib/api/server";
import { getServerTenantContext } from "@/lib/tenant/server";
import type { SchoolRecord } from "@makyschool/shared/types";

export default async function BillingPage() {
  const headerList = await headers();
  const tenant = await getServerTenantContext(headerList);

  if (!tenant?.schoolSlug) {
    redirect("/login");
  }

  let school: SchoolRecord | null = null;

  try {
    const payload = await apiFetch<{ school: SchoolRecord | null }>("/schools/setup/status", {
      schoolSlug: tenant.schoolSlug,
    });
    school = payload.school;
  } catch {
    redirect("/login");
  }

  if (!school) {
    redirect("/dashboard/setup");
  }

  return (
    <DashboardPage
      title="Billing"
      description="MakySchool subscription"
      maxWidth="lg"
    >
      <div className="rounded-2xl border border-theme bg-theme-surface p-6">
        <p className="text-sm text-theme-muted">
          Status: <span className="font-medium text-theme-primary">{school.subscription_status}</span>
        </p>
        <p className="mt-4 text-sm leading-6 text-theme-muted">
          UGX {SUBSCRIPTION_FEE_UGX.toLocaleString()} per term via SchoolPay.
        </p>
        {school.schoolpay_code ? (
          <p className="mt-4 rounded-lg border border-theme bg-input px-4 py-3 font-mono text-sm text-theme-primary">
            {school.schoolpay_code}
          </p>
        ) : (
          <p className="mt-4 text-sm text-theme-muted">
            Contact your platform administrator for your SchoolPay code.
          </p>
        )}
        <Link
          href="/dashboard"
          className="mt-6 inline-flex ms-btn-ghost"
        >
          Back
        </Link>
      </div>
    </DashboardPage>
  );
}
