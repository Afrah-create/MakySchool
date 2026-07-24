import type { ReactNode } from "react";
import { cn } from "@makyschool/ui/lib/cn";

export function FeesStatStrip({
  items,
}: {
  items: Array<{
    label: string;
    value: ReactNode;
    hint?: string;
    tone?: "default" | "danger" | "success";
  }>;
}) {
  const cols =
    items.length <= 2
      ? "grid-cols-1 sm:grid-cols-2"
      : items.length === 3
        ? "grid-cols-1 sm:grid-cols-3"
        : "grid-cols-2 lg:grid-cols-4";

  return (
    <div className={cn("grid gap-3 sm:gap-4", cols)}>
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-2xl border border-theme bg-theme-surface px-4 py-4 sm:px-5"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
            {item.label}
          </p>
          <p
            className={cn(
              "mt-2 text-lg font-semibold tabular-nums tracking-tight sm:text-xl",
              item.tone === "danger" && "text-theme-danger",
              item.tone === "success" && "text-theme-success-text",
              (!item.tone || item.tone === "default") && "text-theme-primary",
            )}
          >
            {item.value}
          </p>
          {item.hint ? <p className="mt-1 text-xs text-theme-muted">{item.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}
