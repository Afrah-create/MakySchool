"use client";

import { subscriptionsEnabled } from "@makyschool/shared/constants";
import { DashboardClassesTable } from "@/components/school-admin/DashboardClassesTable";
import { DashboardHero } from "@/components/school-admin/DashboardHero";
import { DashboardQuickActions } from "@/components/school-admin/DashboardQuickActions";
import { DashboardStatStrip } from "@/components/school-admin/DashboardStatStrip";
import { DashboardAnalyticsStrip } from "@/components/school-admin/DashboardAnalyticsStrip";
import { DisciplineRepeatOffendersBanner } from "@/components/school-admin/DisciplineRepeatOffendersBanner";
import { RolloverResumeBanner } from "@/components/school-admin/RolloverResumeBanner";
import { SubscriptionBanner } from "@/components/school-admin/SubscriptionBanner";
import { useSchool } from "@/providers/SchoolProvider";

export function SchoolAdminDashboardHome() {
  const { school } = useSchool();

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      {subscriptionsEnabled() ? <SubscriptionBanner /> : null}
      <RolloverResumeBanner />
      <DashboardHero school={school} />
      <DisciplineRepeatOffendersBanner />
      <DashboardStatStrip />
      <DashboardQuickActions />
      <DashboardAnalyticsStrip />
      <DashboardClassesTable />
    </div>
  );
}
