"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type DropdownMenuItem = {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  variant?: "danger" | "success" | "default";
  dividerBefore?: boolean;
};

export function DropdownMenu({
  trigger,
  items,
}: {
  trigger: ReactNode;
  items: DropdownMenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex">
        {trigger}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-20 mt-1 min-w-[160px] rounded-xl border border-theme bg-theme-surface py-1 shadow-theme-panel">
          {items.map((item) => {
            const Icon = item.icon;
            const variantClass =
              item.variant === "danger"
                ? "text-theme-danger hover:bg-theme-danger-bg"
                : item.variant === "success"
                  ? "text-theme-success hover:bg-theme-success-bg"
                  : "text-theme-primary hover:bg-theme-surface-raised";

            return (
              <div key={item.label}>
                {item.dividerBefore ? <div className="my-1 border-t border-theme" /> : null}
                <button
                  type="button"
                  onClick={() => {
                    item.onClick();
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${variantClass}`}
                >
                  {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
                  {item.label}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
