"use client";

import { subscriptionsEnabled } from "@makyschool/shared/constants";
import { DashboardClassesTable } from "@/components/school-admin/DashboardClassesTable";
import { DashboardHero } from "@/components/school-admin/DashboardHero";
import { DashboardQuickActions } from "@/components/school-admin/DashboardQuickActions";
import { DashboardStatStrip } from "@/components/school-admin/DashboardStatStrip";
import { SubscriptionBanner } from "@/components/school-admin/SubscriptionBanner";
import { useSchool } from "@/providers/SchoolProvider";

export function SchoolAdminDashboardHome() {
  const { school } = useSchool();

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {subscriptionsEnabled() ? <SubscriptionBanner /> : null}
      <DashboardHero school={school} />
      <DashboardQuickActions />
      <DashboardStatStrip />
      <DashboardClassesTable />
    </div>
  );
}
