"use client";

import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { DataRetentionSettingsLoader } from "@/components/school-admin/settings/DataRetentionSettingsForm";

export default function DataRetentionSettingsPage() {
  return (
    <DashboardPage
      embedded
      eyebrow="Settings"
      title="Data retention"
      description="Control which academic years stay hot in day-to-day selectors versus warm or archived historical access. Data is never deleted."
      maxWidth="5xl"
    >
      <DataRetentionSettingsLoader />
    </DashboardPage>
  );
}
