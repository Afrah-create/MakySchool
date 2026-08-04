"use client";

import { useState } from "react";
import { mutate } from "swr";
import { can } from "@makyschool/shared/constants";
import type { AcademicYearSummary } from "@makyschool/shared/types";
import { cn } from "@makyschool/ui/lib/cn";
import { useSchoolSWR } from "@/hooks/useSchoolSWR";
import { useCurrentTerm } from "@/hooks/useCurrentTerm";
import { useCurrentRole } from "@/hooks/useCurrentRole";
import { apiClient } from "@/lib/api/client";
import { useOptionalSchool } from "@/providers/SchoolProvider";
import { useToast } from "@/providers/ToastProvider";

/**
 * Academic year dropdown for admins, plus current term label.
 * Uses server portal role so soft navigation does not wait on /auth/me.
 */
export function AcademicYearTopSwitch({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const role = useCurrentRole();
  const schoolCtx = useOptionalSchool();
  const schoolSlug = schoolCtx?.schoolSlug ?? "";
  const { toast } = useToast();
  const canSwitch = role ? can(role, "manageAcademicYear") : false;

  const { data: term } = useCurrentTerm();
  const { data: years, isLoading, error } = useSchoolSWR<AcademicYearSummary[]>(
    canSwitch && schoolSlug ? "/schools/settings/academic-years?visibility=hot" : null,
  );
  const [busy, setBusy] = useState(false);

  const current = years?.find((y) => y.isCurrent) ?? years?.[0] ?? null;
  const yearLabel = current?.year ?? term?.academicYear ?? null;
  const termLabel = term?.name?.trim() || null;

  // Still mounting portal chrome — keep a stable slot so soft nav does not blank the header.
  if (!role && !yearLabel && !termLabel) {
    return (
      <div className={cn("flex items-center gap-1.5", className)} aria-hidden>
        <span
          className={cn(
            "inline-flex items-center rounded-lg border border-theme bg-theme-raised/40 px-2 font-semibold tabular-nums text-theme-faint",
            compact ? "h-7 text-[11px]" : "h-8 text-xs",
          )}
        >
          ····
        </span>
      </div>
    );
  }

  if (!canSwitch && !yearLabel && !termLabel) {
    return null;
  }

  async function onChange(yearId: string) {
    if (!yearId || yearId === current?.id || !schoolSlug) return;
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

  const showSelect = Boolean(canSwitch && years && years.length > 0);
  const showPlaceholder = Boolean(
    canSwitch && !showSelect && (isLoading || !error),
  );

  return (
    <div
      className={cn("flex items-center gap-1.5", className)}
      title={[yearLabel ? `Year ${yearLabel}` : null, termLabel].filter(Boolean).join(" · ")}
    >
      {showSelect ? (
        <label className="inline-flex items-center" title="Current academic year">
          <span className="sr-only">Academic year</span>
          <select
            className={cn(
              "ms-input !w-auto !py-0 !text-xs",
              compact ? "!h-7 !min-w-[4.25rem] !max-w-[6.5rem]" : "!h-8 !min-w-[5.5rem]",
            )}
            disabled={busy || (years?.length ?? 0) < 2}
            value={current?.id ?? ""}
            onChange={(e) => void onChange(e.target.value)}
            aria-label="Switch academic year"
          >
            {(years ?? []).map((y) => (
              <option key={y.id} value={y.id}>
                {compact ? y.year : `${y.year}${y.isCurrent ? " · current" : ""}`}
              </option>
            ))}
          </select>
        </label>
      ) : showPlaceholder ? (
        <span
          className={cn(
            "inline-flex items-center rounded-lg border border-theme bg-theme-raised/40 px-2 font-semibold tabular-nums text-theme-muted",
            compact ? "h-7 text-[11px]" : "h-8 text-xs",
          )}
          aria-busy="true"
        >
          {yearLabel ?? "····"}
        </span>
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

      {termLabel && !compact ? (
        <span className="hidden max-w-[6.5rem] truncate text-xs font-medium text-theme-muted lg:inline">
          {termLabel}
        </span>
      ) : null}
    </div>
  );
}
