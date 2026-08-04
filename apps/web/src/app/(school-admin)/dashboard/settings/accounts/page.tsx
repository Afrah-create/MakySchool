"use client";

import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { ChartOfAccountsContent } from "@/components/fees/ChartOfAccountsContent";

export default function ChartOfAccountsPage() {
  return (
    <DashboardPage
      embedded
      eyebrow="Settings"
      title="Chart of accounts"
      description="Income and expense accounts for invoicing, other income, and budgets."
      maxWidth="5xl"
    >
      <ChartOfAccountsContent embedded />
    </DashboardPage>
  );
}
