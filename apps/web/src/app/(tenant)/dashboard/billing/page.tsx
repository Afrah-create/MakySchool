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
      <div className="mx-auto max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#F0F2FA]">Billing</h1>
          <p className="mt-1 text-sm text-[#8B90A7]">MakySchool subscription</p>
        </div>

        <div className="rounded-2xl border border-[#252A3A] bg-[#181C27] p-6">
          <p className="text-sm text-[#8B90A7]">
            Status: <span className="font-medium text-[#F0F2FA]">{school.subscription_status}</span>
          </p>
          <p className="mt-4 text-sm leading-6 text-[#8B90A7]">
            UGX {SUBSCRIPTION_FEE_UGX.toLocaleString()} per term via SchoolPay.
          </p>
          {school.schoolpay_code ? (
            <p className="mt-4 rounded-lg border border-[#252A3A] bg-[#0F1117] px-4 py-3 font-mono text-sm text-[#F0F2FA]">
              {school.schoolpay_code}
            </p>
          ) : (
            <p className="mt-4 text-sm text-[#8B90A7]">
              Contact your platform administrator for your SchoolPay code.
            </p>
          )}
          <Link
            href="/dashboard"
            className="mt-6 inline-flex rounded-lg border border-[#252A3A] px-4 py-2.5 text-sm font-medium text-[#F0F2FA] hover:bg-[#252A3A]/50"
          >
            Back
          </Link>
        </div>
      </div>
    </main>
  );
}
