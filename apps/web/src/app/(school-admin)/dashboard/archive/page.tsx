"use client";

import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { HistoricalRecordsPage } from "@/components/school-admin/HistoricalRecordsPage";

export default function ArchivePage() {
  return (
    <DashboardPage
      embedded
      eyebrow="Archive"
      title="Historical records"
      description="Read-only access to warm and archived academic years. Data is never deleted."
      maxWidth="5xl"
    >
      <HistoricalRecordsPage />
    </DashboardPage>
  );
}
