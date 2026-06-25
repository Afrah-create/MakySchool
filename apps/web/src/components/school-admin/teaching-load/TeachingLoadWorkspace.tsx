"use client";

import type { ReactNode } from "react";
import { cn } from "@makyschool/ui/lib/cn";
import type { TeachingLoadStats } from "@makyschool/shared/types";

export type TeachingLoadMode = "by-teacher" | "by-class" | "by-subject";

export function TeachingLoadWorkspace({
  mode,
  onModeChange,
  stats,
  children,
}: {
  mode: TeachingLoadMode;
  onModeChange: (mode: TeachingLoadMode) => void;
  stats: TeachingLoadStats;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="ms-card flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-theme-primary">Teaching load</h2>
          <p className="mt-1 text-sm text-theme-muted">
            Assign teachers to class subjects in your curriculum. One teacher per subject slot.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <StatPill label="Curriculum slots" value={stats.total_slots} />
            <StatPill
              label="Assigned"
              value={stats.assigned}
              tone={stats.unassigned > 0 ? "success" : "default"}
            />
            <StatPill
              label="Unassigned"
              value={stats.unassigned}
              tone={stats.unassigned > 0 ? "warning" : "default"}
            />
            {stats.teachers_without_load > 0 ? (
              <StatPill
                label="Teachers without load"
                value={stats.teachers_without_load}
                tone="warning"
              />
            ) : null}
          </div>
        </div>
        <TeachingLoadModeSwitch mode={mode} onChange={onModeChange} />
      </div>
      {children}
    </div>
  );
}

function StatPill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium tabular-nums",
        tone === "warning" && "bg-amber-500/15 text-amber-800 dark:text-amber-100",
        tone === "success" && "badge-success",
        tone === "default" && "bg-theme-raised text-theme-muted",
      )}
    >
      <span>{label}</span>
      <span className="text-theme-primary">{value}</span>
    </span>
  );
}

function TeachingLoadModeSwitch({
  mode,
  onChange,
}: {
  mode: TeachingLoadMode;
  onChange: (mode: TeachingLoadMode) => void;
}) {
  const options: { id: TeachingLoadMode; label: string; hint: string }[] = [
    { id: "by-teacher", label: "By teacher", hint: "Assign slots to one teacher" },
    { id: "by-class", label: "By class", hint: "Pick a class and assign teachers per subject" },
    { id: "by-subject", label: "By subject", hint: "Assign one subject across classes" },
  ];

  return (
    <div className="flex shrink-0 gap-1 rounded-xl border border-theme bg-input p-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          title={option.hint}
          onClick={() => onChange(option.id)}
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-medium transition",
            mode === option.id
              ? "bg-theme-surface text-theme-primary shadow-theme-card"
              : "text-theme-muted hover:text-theme-primary",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
