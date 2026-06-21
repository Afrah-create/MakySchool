"use client";

import { cn } from "../../lib/cn";

export function ProgressBar({
  indeterminate = true,
  value,
  className,
}: {
  indeterminate?: boolean;
  value?: number;
  className?: string;
}) {
  if (indeterminate) {
    return (
      <div
        className={cn("relative h-0.5 w-full overflow-hidden bg-theme-icon/40", className)}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Loading"
      >
        <div className="progress-bar-indeterminate absolute inset-y-0 w-1/3 bg-theme-accent" />
      </div>
    );
  }

  const clamped = Math.min(100, Math.max(0, value ?? 0));

  return (
    <div
      className={cn("h-1 w-full overflow-hidden rounded-full bg-theme-icon/40", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
    >
      <div
        className="h-full rounded-full bg-theme-accent transition-[width] duration-300 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
