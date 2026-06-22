"use client";

import Link from "next/link";
import type { SubjectWithDetails } from "@makyschool/shared/types";
import { useApiSWR } from "@/hooks/useApiSWR";

export function SubjectSpecializationSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { data: subjects, isLoading, error } = useApiSWR<SubjectWithDetails[]>("/schools/subjects");

  const hasLegacyValue =
    value.trim().length > 0 &&
    !(subjects ?? []).some((subject) => subject.name === value);

  if (isLoading) {
    return (
      <select className="ms-input" disabled>
        <option>Loading subjects…</option>
      </select>
    );
  }

  if (error) {
    return <p className="text-xs text-theme-danger">Could not load subjects. Try again later.</p>;
  }

  if (!subjects?.length) {
    return (
      <div className="rounded-lg border border-dashed border-theme bg-theme-surface-raised px-3 py-2 text-sm text-theme-muted">
        No subjects registered yet.{" "}
        <Link href="/dashboard/subjects" className="text-theme-accent hover:underline">
          Add subjects
        </Link>{" "}
        before assigning a specialisation.
      </div>
    );
  }

  return (
    <select
      className="ms-input"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Select a subject</option>
      {hasLegacyValue ? (
        <option value={value}>{value} (current)</option>
      ) : null}
      {subjects.map((subject) => (
        <option key={subject.id} value={subject.name}>
          {subject.name}
        </option>
      ))}
    </select>
  );
}
