"use client";

import { useMemo, useState } from "react";
import { CalendarRange } from "lucide-react";
import { mutate } from "swr";
import type { AcademicYearSummary } from "@makyschool/shared/types";
import { ConfirmDialog } from "@makyschool/ui/components/ui/ConfirmDialog";
import { DataTable } from "@makyschool/ui/components/ui/DataTable";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { StatusBanner } from "@makyschool/ui/components/ui/StatusBanner";
import {
  SettingsSection,
} from "@/components/school-admin/settings/SettingsFormLayout";
import { apiClient } from "@/lib/api/client";
import { useSchool } from "@/providers/SchoolProvider";
import { useToast } from "@/providers/ToastProvider";

function statusLabel(status: AcademicYearSummary["status"], isCurrent: boolean) {
  if (isCurrent) return "Current";
  if (status === "draft") return "Draft";
  if (status === "closed") return "Closed";
  if (status === "active") return "Active";
  return "—";
}

export function AcademicYearSwitcher({
  years,
  currentYearId,
  onSwitched,
}: {
  years: AcademicYearSummary[];
  currentYearId: string | null;
  onSwitched: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const { schoolSlug } = useSchool();
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [confirmYear, setConfirmYear] = useState<AcademicYearSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...years].sort((a, b) => b.year - a.year || (b.isCurrent ? 1 : 0) - (a.isCurrent ? 1 : 0)),
    [years],
  );

  async function activate(year: AcademicYearSummary) {
    if (year.isCurrent || year.id === currentYearId) {
      setConfirmYear(null);
      return;
    }
    setSwitchingId(year.id);
    setError(null);
    try {
      await apiClient(`/schools/settings/academic-years/${year.id}/activate`, {
        method: "POST",
        body: {},
      });
      toast.success(`Switched to academic year ${year.year}.`);
      setConfirmYear(null);
      // Refresh any screens that depend on current year / term.
      await mutate(
        (key) => Array.isArray(key) && typeof key[0] === "string" && key[1] === schoolSlug,
      );
      await onSwitched();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not switch academic year.";
      setError(message);
      toast.error(message);
    } finally {
      setSwitchingId(null);
    }
  }

  if (sorted.length === 0) {
    return (
      <SettingsSection
        icon={CalendarRange}
        title="Academic years"
        description="No academic years yet. Save term dates below or run year rollover to create one."
      >
        <StatusBanner tone="info" message="Create your first academic year using the form below." />
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      icon={CalendarRange}
      title="Switch academic year"
      description="Choose which year the school operates in. Historical data is never deleted — switching only changes the current year used across the app."
    >
      <div className="space-y-3">
        {error ? (
          <div className="rounded-lg bg-theme-danger-bg px-3 py-2 text-sm text-theme-danger">{error}</div>
        ) : null}

        <DataTable embedded minWidth="28rem">
          <thead>
            <tr>
              <th>Year</th>
              <th>Status</th>
              <th>Terms</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.map((year) => {
              const isCurrent = year.isCurrent || year.id === currentYearId;
              return (
                <tr key={year.id} className={isCurrent ? "bg-theme-accent-muted/40" : undefined}>
                  <td className="font-medium text-theme-primary">{year.year}</td>
                  <td>
                    <span
                      className={
                        isCurrent
                          ? "rounded-full bg-theme-accent-muted px-2 py-0.5 text-xs font-medium text-theme-accent"
                          : "text-sm text-theme-muted"
                      }
                    >
                      {statusLabel(year.status, isCurrent)}
                    </span>
                  </td>
                  <td className="text-sm text-theme-muted">{year.termCount ?? "—"}</td>
                  <td className="text-right">
                    {isCurrent ? (
                      <span className="text-xs text-theme-muted">In use</span>
                    ) : (
                      <LoadingButton
                        variant="ghost"
                        loading={switchingId === year.id}
                        className="rounded-lg px-3 py-1.5 text-sm"
                        onClick={() => setConfirmYear(year)}
                      >
                        Set as current
                      </LoadingButton>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </div>

      <ConfirmDialog
        open={!!confirmYear}
        title={`Switch to ${confirmYear?.year}?`}
        description="The whole school will use this academic year for classes, assignments, fees, and terms. Previous years stay fully readable and unchanged."
        confirmLabel="Switch year"
        loading={!!switchingId}
        onCancel={() => {
          if (!switchingId) setConfirmYear(null);
        }}
        onConfirm={() => {
          if (confirmYear) void activate(confirmYear);
        }}
      />
    </SettingsSection>
  );
}
