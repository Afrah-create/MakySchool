"use client";

import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { SettingsPageSkeleton } from "@/components/school-admin/settings/SettingsPageSkeleton";
import { useSchoolSettings } from "@/components/school-admin/settings/useSchoolSettings";

export function SettingsPanel({
  eyebrow = "Settings",
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children: (args: {
    settings: NonNullable<ReturnType<typeof useSchoolSettings>["settings"]>;
    reload: () => Promise<void>;
  }) => React.ReactNode;
}) {
  const { settings, loading, error, reload } = useSchoolSettings();

  return (
    <DashboardPage embedded eyebrow={eyebrow} title={title} description={description} maxWidth="5xl">
      <QueryState
        isLoading={loading}
        error={error}
        data={settings ?? undefined}
        onRetry={() => void reload()}
        loading={<SettingsPageSkeleton />}
        errorView={
          <EmptyState
            variant="error"
            title="Couldn't load settings"
            description="We couldn't fetch your school settings. Check your connection and try again."
            onRetry={() => void reload()}
          />
        }
        empty={
          <EmptyState
            title="No settings found"
            description="Your school profile hasn't been set up yet. Complete the setup wizard first."
          />
        }
        isEmpty={(data) => !data}
      >
        {(data) => <div className="space-y-6">{children({ settings: data, reload })}</div>}
      </QueryState>
    </DashboardPage>
  );
}
