import type { ReactNode } from "react";
import { cn } from "@makyschool/ui/lib/cn";

export function FeesStatStrip({
  items,
}: {
  items: Array<{ label: string; value: ReactNode; tone?: "default" | "danger" | "success" }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-theme bg-theme-surface px-4 py-3"
        >
          <p className="text-xs font-medium text-theme-muted">{item.label}</p>
          <p
            className={cn(
              "mt-1 truncate text-lg font-semibold tabular-nums",
              item.tone === "danger" && "text-theme-danger",
              item.tone === "success" && "text-theme-success-text",
              !item.tone || item.tone === "default" ? "text-theme-primary" : undefined,
            )}
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
