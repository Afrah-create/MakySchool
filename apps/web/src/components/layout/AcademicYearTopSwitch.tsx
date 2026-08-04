"use client";

import { useState } from "react";
import { mutate } from "swr";
import { can } from "@makyschool/shared/constants";
import type { AcademicYearSummary } from "@makyschool/shared/types";
import { useSchoolSWR } from "@/hooks/useSchoolSWR";
import { apiClient } from "@/lib/api/client";
import { useAuth } from "@/hooks/useAuth";
import { useSchool } from "@/providers/SchoolProvider";
import { useToast } from "@/providers/ToastProvider";

/**
 * Compact admin control in the top bar to switch the school's current academic year.
 */
export function AcademicYearTopSwitch() {
  const { state } = useAuth();
  const { schoolSlug } = useSchool();
  const { toast } = useToast();
  const allowed = state.user?.role ? can(state.user.role, "manageAcademicYear") : false;
  const { data: years, isLoading } = useSchoolSWR<AcademicYearSummary[]>(
    allowed ? "/schools/settings/academic-years" : null,
  );
  const [busy, setBusy] = useState(false);

  if (!allowed || isLoading || !years?.length) {
    return null;
  }

  const current = years.find((y) => y.isCurrent) ?? years[0];

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
    <label className="hidden items-center gap-1.5 md:flex" title="Current academic year">
      <span className="sr-only">Academic year</span>
      <select
        className="ms-input !h-8 !w-auto !py-0 !text-xs"
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
  );
}
