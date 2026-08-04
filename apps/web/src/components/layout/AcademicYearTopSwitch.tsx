"use client";

import { useState } from "react";
import { mutate } from "swr";
import { can } from "@makyschool/shared/constants";
import type { AcademicYearSummary } from "@makyschool/shared/types";
import { cn } from "@makyschool/ui/lib/cn";
import { useSchoolSWR } from "@/hooks/useSchoolSWR";
import { useCurrentTerm } from "@/hooks/useCurrentTerm";
import { apiClient } from "@/lib/api/client";
import { useAuth } from "@/hooks/useAuth";
import { useSchool } from "@/providers/SchoolProvider";
import { useToast } from "@/providers/ToastProvider";

/**
 * Academic year dropdown for admins, plus current term label.
 */
export function AcademicYearTopSwitch({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { state } = useAuth();
  const { schoolSlug } = useSchool();
  const { toast } = useToast();
  const canSwitch = state.user?.role ? can(state.user.role, "manageAcademicYear") : false;

  const { data: term } = useCurrentTerm();
  const { data: years, isLoading } = useSchoolSWR<AcademicYearSummary[]>(
    canSwitch ? "/schools/settings/academic-years?visibility=hot" : null,
  );
  const [busy, setBusy] = useState(false);

  const current = years?.find((y) => y.isCurrent) ?? years?.[0] ?? null;
  const yearLabel = current?.year ?? term?.academicYear ?? null;
  const termLabel = term?.name?.trim() || null;

  if (canSwitch && (isLoading || !years?.length) && !yearLabel && !termLabel) {
    return null;
  }
  if (!canSwitch && !yearLabel && !termLabel) {
    return null;
  }

  async function onChange(yearId: string) {
    if (!yearId || yearId === current?.id) return;
    const target = years?.find((y) => y.id === yearId);
    setBusy(true);
    try {
      await apiClient(`/schools/settings/academic-years/${yearId}/activate`, {
        method: "POST",
        body: {},
      });
      toast.success(`Switched to academic year ${target?.year ?? ""}.`.trim());
      await mutate(
        (key) => Array.isArray(key) && typeof key[0] === "string" && key[1] === schoolSlug,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not switch year.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn("flex items-center gap-2", className)}
      title={[yearLabel ? `Year ${yearLabel}` : null, termLabel].filter(Boolean).join(" · ")}
    >
      {canSwitch && years && years.length > 0 ? (
        <label className="inline-flex items-center" title="Current academic year">
          <span className="sr-only">Academic year</span>
          <select
            className={cn(
              "ms-input !w-auto !py-0 !text-xs",
              compact ? "!h-7 !min-w-[4.5rem]" : "!h-8 !min-w-[5.5rem]",
            )}
            disabled={busy || years.length < 2}
            value={current?.id ?? ""}
            onChange={(e) => void onChange(e.target.value)}
            aria-label="Switch academic year"
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.year}
                {y.isCurrent ? " · current" : ""}
              </option>
            ))}
          </select>
        </label>
      ) : yearLabel ? (
        <span
          className={cn(
            "rounded-lg border border-theme bg-theme-raised/40 px-2 font-semibold tabular-nums text-theme-primary",
            compact ? "py-0.5 text-[11px]" : "py-1 text-xs",
          )}
        >
          {yearLabel}
        </span>
      ) : null}

      {termLabel ? (
        <span
          className={cn(
            "hidden max-w-[6.5rem] truncate font-medium text-theme-muted sm:inline",
            compact ? "text-[11px]" : "text-xs",
          )}
        >
          {termLabel}
        </span>
      ) : null}
    </div>
  );
}
