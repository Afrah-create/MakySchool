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
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden">
      {items.map((item) => (
        <div
          key={item.label}
          className="min-w-[9.75rem] flex-1 rounded-2xl border border-theme bg-theme-surface px-3.5 py-3.5 sm:min-w-0 sm:px-5 sm:py-4"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
            {item.label}
          </p>
          <p
            className={cn(
              "mt-1.5 text-lg font-semibold tabular-nums tracking-tight sm:mt-2 sm:text-xl",
              item.tone === "danger" && "text-theme-danger",
              item.tone === "success" && "text-theme-success",
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
