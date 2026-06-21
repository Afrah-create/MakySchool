import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";
import { SubscriptionFeeForm } from "@/components/settings/SubscriptionFeeForm";
import { apiFetch } from "@/lib/api/server";
import type { PlatformBillingSettings } from "@makyschool/shared/types";

export default async function PlatformSettingsPage() {
  let billing: PlatformBillingSettings | null = null;

  try {
    billing = await apiFetch<PlatformBillingSettings>("/superadmin/settings/billing");
  } catch {
    billing = null;
  }

  return (
    <DashboardPage
      title="Settings"
      description="Platform account and billing configuration"
      maxWidth="lg"
    >
      <div className="space-y-6">
        <ChangePasswordForm />
        {billing ? <SubscriptionFeeForm initial={billing} /> : (
          <div className="ms-panel p-6 text-sm text-theme-muted">
            Unable to load billing settings. Try refreshing the page.
          </div>
        )}
      </div>
    </DashboardPage>
  );
}
