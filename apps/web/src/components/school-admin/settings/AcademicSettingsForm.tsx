"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import type { SchoolSettingsResponse } from "@makyschool/shared/types";
import { AcademicYearStep } from "@/components/school-admin/setup/steps/AcademicYearStep";
import { AcademicYearSwitcher } from "@/components/school-admin/settings/AcademicYearSwitcher";
import {
  SettingsFormFooter,
  SettingsSection,
} from "@/components/school-admin/settings/SettingsFormLayout";
import { apiClient } from "@/lib/api/client";
import { useToast } from "@/providers/ToastProvider";

function toFormValue(settings: SchoolSettingsResponse) {
  const year = settings.academic_year;
  const terms =
    year.terms.length > 0
      ? year.terms.map((term) => ({
          name: term.name,
          startDate: term.startDate ?? "",
          endDate: term.endDate ?? "",
        }))
      : [
          { name: "Term 1", startDate: "", endDate: "" },
          { name: "Term 2", startDate: "", endDate: "" },
          { name: "Term 3", startDate: "", endDate: "" },
        ];

  return {
    year: year.year ?? new Date().getFullYear(),
    terms,
  };
}

export function AcademicSettingsForm({
  settings,
  onSaved,
}: {
  settings: SchoolSettingsResponse;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [value, setValue] = useState(() => toFormValue(settings));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(toFormValue(settings));
  }, [settings]);

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      await apiClient("/schools/settings/academic-year", {
        method: "PUT",
        body: {
          year: value.year,
          terms: value.terms.map((term) => ({
            name: term.name,
            startDate: term.startDate || null,
            endDate: term.endDate || null,
          })),
        },
      });
      toast.success("Academic year updated.");
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save academic year.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  const years = settings.academic_years ?? [];

  return (
    <div className="space-y-6">
      <AcademicYearSwitcher
        years={years}
        currentYearId={settings.academic_year.id}
        onSwitched={onSaved}
      />

      <SettingsSection
        icon={CalendarDays}
        title="Edit current year terms"
        description="Update term dates for the selected year number, or enter a new year number to create another year. Previous years and their terms are kept."
      >
        <AcademicYearStep value={value} onChange={setValue} />
        <p className="mt-3 text-sm text-theme-muted">
          Ready for a new school year with student promotion?{" "}
          <Link href="/dashboard/settings/year-rollover" className="text-theme-primary underline">
            Open year rollover
          </Link>
          .
        </p>
      </SettingsSection>

      {error ? (
        <div className="rounded-lg bg-theme-danger-bg px-3 py-2 text-sm text-theme-danger">{error}</div>
      ) : null}

      <SettingsFormFooter saving={saving} saveLabel="Save academic year" onSave={() => void handleSave()} />
    </div>
  );
}
