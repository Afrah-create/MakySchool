import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { BillingCheckout } from "@/components/school-admin/BillingCheckout";
import { apiFetch } from "@/lib/api/server";
import { getTenantPayloadFromCookies } from "@/lib/auth/server-tenant";
import { getServerTenantContext } from "@/lib/tenant/server";
import type { BillingQuote, SchoolRecord, SetupStatusResponse } from "@makyschool/shared/types";

export default async function BillingPage() {
  const headerList = await headers();
  const tenant = await getServerTenantContext(headerList);
  const session = await getTenantPayloadFromCookies();

  if (!tenant?.schoolSlug) {
    redirect("/login");
  }

  if (session?.role !== "admin") {
    return (
      <DashboardPage title="Billing" description="MakySchool subscription" maxWidth="lg">
        <div className="ms-panel p-6 text-sm leading-6 text-theme-muted">
          Only school administrators can manage billing. Ask your school admin to complete the
          subscription payment.
        </div>
      </DashboardPage>
    );
  }

  let school: SchoolRecord | null = null;
  let quote: BillingQuote | null = null;

  try {
    const [statusPayload, quotePayload] = await Promise.all([
      apiFetch<SetupStatusResponse>("/schools/setup/status", {
        schoolSlug: tenant.schoolSlug,
      }),
      apiFetch<BillingQuote>("/schools/billing/quote", {
        schoolSlug: tenant.schoolSlug,
      }).catch(() => null),
    ]);

    school = statusPayload.school ?? null;
    quote = quotePayload;
  } catch {
    redirect("/login");
  }

  if (!school) {
    redirect("/dashboard/setup");
  }

  const needsPayment =
    school.subscription_status === "unpaid" || school.subscription_status === "expired";

  return (
    <DashboardPage
      title="Billing"
      description={
        needsPayment
          ? "Pay your term subscription to restore full access"
          : "MakySchool subscription"
      }
      maxWidth="lg"
    >
      <BillingCheckout school={school} quote={quote} />

      {school.subscription_status === "active" ? (
        <div className="mt-6">
          <Link href="/dashboard" className="inline-flex ms-btn-ghost">
            Back to dashboard
          </Link>
        </div>
      ) : null}
    </DashboardPage>
  );
}
