import type { ReactNode } from "react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { PageHeader } from "@makyschool/ui/components/ui/PageHeader";

/**
 * Consistent shell for bursar/admin fees pages — responsive padding via DashboardPage.
 */
export function FeesPageShell({
  title,
  description,
  actions,
  children,
  eyebrow = "Fees",
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  eyebrow?: string;
}) {
  return (
    <DashboardPage embedded maxWidth="7xl">
      <div className="space-y-5 sm:space-y-6">
        <div className="space-y-1">
          {eyebrow ? (
            <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">{eyebrow}</p>
          ) : null}
          <PageHeader title={title} description={description} actions={actions} />
        </div>
        {children}
      </div>
    </DashboardPage>
  );
}
