"use client";

import { formatClassLabel } from "@makyschool/shared/constants";
import type { ClassWithDetails, TimetableGrid } from "@makyschool/shared/types";
import { BrandLogo } from "@makyschool/ui/components/ui/BrandLogo";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { useSchoolSWR } from "@/hooks/useSchoolSWR";
import { useSchool } from "@/providers/SchoolProvider";
import { TIMETABLE_DAYS, resolvePeriodCount, slotKey } from "@/lib/timetable/utils";

export function TimetablePrintView({ classId }: { classId: string }) {
  const { school } = useSchool();
  const { data: classes } = useSchoolSWR<ClassWithDetails[]>("/schools/classes");
  const { data: grid, error, isLoading, mutate } = useSchoolSWR<TimetableGrid>(
    `/schools/timetable/class/${classId}`,
  );

  const selectedClass = classes?.find((item) => item.id === classId);
  const periodCount = resolvePeriodCount(grid?.periods ?? []);
  const generatedOn = new Date().toLocaleDateString("en-UG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="timetable-print mx-auto max-w-5xl px-6 py-8">
      <div className="timetable-print-actions mb-6 flex justify-end print:hidden">
        <button type="button" className="ms-btn-primary" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <header className="mb-8 flex items-center gap-4 border-b border-theme pb-6">
        <BrandLogo size={48} />
        <div>
          <h1 className="text-xl font-semibold">{school?.name ?? "School"}</h1>
          <p className="text-sm text-theme-muted">
            {selectedClass
              ? formatClassLabel(selectedClass.level, selectedClass.stream)
              : "Class"}{" "}
            · Weekly timetable
          </p>
          <p className="text-xs text-theme-muted">Generated on {generatedOn}</p>
        </div>
      </header>

      <QueryState
        isLoading={isLoading && !grid}
        error={error}
        data={grid}
        onRetry={() => void mutate()}
        loading={<Skeleton className="h-64 w-full rounded-xl" />}
        isEmpty={(value) => value.periods.length === 0}
        empty={
          <p className="text-sm text-theme-muted">No timetable periods have been set for this class.</p>
        }
      >
        {(value) => (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-theme px-3 py-2 text-left">Period</th>
                {TIMETABLE_DAYS.map((day) => (
                  <th key={day.value} className="border border-theme px-3 py-2 text-left">
                    {day.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: periodCount }, (_, index) => index + 1).map((periodNumber) => (
                <tr key={periodNumber}>
                  <td className="border border-theme px-3 py-2 font-medium">P{periodNumber}</td>
                  {TIMETABLE_DAYS.map((day) => {
                    const period = value.periods.find(
                      (item) =>
                        item.day_of_week === day.value &&
                        item.period_number === periodNumber,
                    );
                    return (
                      <td key={slotKey(day.value, periodNumber)} className="border border-theme px-3 py-2 align-top">
                        {period ? (
                          <div>
                            <p className="font-medium">{period.subject_name}</p>
                            <p className="text-xs text-theme-muted">{period.teacher_name}</p>
                            <p className="text-xs text-theme-muted">
                              {period.start_time}–{period.end_time} · {period.track}
                            </p>
                          </div>
                        ) : (
                          <span className="text-theme-muted">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </QueryState>
    </div>
  );
}
