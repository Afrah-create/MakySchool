import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SUBSCRIPTION_FEE_UGX } from "@makyschool/shared/constants";
import { apiFetch } from "@/lib/api/server";
import { getTenantFromHeaders } from "@/lib/tenant/server";
import type { SchoolRecord } from "@makyschool/shared/types";

export default async function BillingPage() {
  const headerList = await headers();
  const tenant = getTenantFromHeaders(headerList);

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
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-slate-500">Billing</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">Renew subscription</h1>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-600">
            Your school subscription is{" "}
            <span className="font-semibold text-slate-900">{school.subscription_status}</span>.
          </p>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Pay UGX {SUBSCRIPTION_FEE_UGX.toLocaleString()} via SchoolPay for{" "}
            {school.subscription_term ?? "the current term"} {school.subscription_year ?? ""} to restore
            full dashboard access.
          </p>
          {school.schoolpay_code ? (
            <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900">
              SchoolPay code: {school.schoolpay_code}
            </p>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              Contact your platform administrator for your SchoolPay merchant code.
            </p>
          )}
          <Link
            href="/dashboard"
            className="mt-6 inline-flex rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
