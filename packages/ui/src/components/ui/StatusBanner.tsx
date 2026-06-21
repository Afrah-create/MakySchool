"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";

export type StatusBannerTone = "success" | "error" | "info";

const toneClass: Record<StatusBannerTone, string> = {
  success: "alert-success",
  error: "alert-error",
  info: "alert-info",
};

export function StatusBanner({
  tone,
  message,
  onDismiss,
  autoDismissMs,
}: {
  tone: StatusBannerTone;
  message: string;
  onDismiss?: () => void;
  autoDismissMs?: number;
}) {
  useEffect(() => {
    if (!autoDismissMs || !onDismiss) {
      return;
    }

    const timer = window.setTimeout(onDismiss, autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [autoDismissMs, message, onDismiss]);

  return (
    <div
      className={cn("flex items-start justify-between gap-3 rounded-lg px-4 py-3 text-sm", toneClass[tone])}
      role={tone === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <p className="leading-relaxed">{message}</p>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-md p-1 opacity-70 transition hover:opacity-100"
          aria-label="Dismiss message"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
