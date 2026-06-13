import type { LucideIcon } from "lucide-react";
import { AlertCircle, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type EmptyStateVariant = "default" | "compact" | "error" | "blocked";

const variantStyles: Record<EmptyStateVariant, string> = {
  default: "rounded-2xl border border-dashed border-theme bg-theme-surface px-6 py-10 shadow-theme-card",
  compact: "rounded-xl border border-dashed border-theme bg-input px-4 py-8",
  error: "rounded-2xl border border-theme bg-theme-surface px-6 py-10 shadow-theme-card",
  blocked: "rounded-2xl border border-theme bg-theme-surface px-6 py-10 shadow-theme-card",
};

const defaultIcons: Partial<Record<EmptyStateVariant, LucideIcon>> = {
  default: Inbox,
  compact: Inbox,
  error: AlertCircle,
  blocked: AlertCircle,
};

export function EmptyState({
  variant = "default",
  icon: Icon,
  title,
  description,
  action,
  onRetry,
  retryLabel = "Try again",
  className,
}: {
  variant?: EmptyStateVariant;
  icon?: LucideIcon | null;
  title: string;
  description: string;
  action?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  const ResolvedIcon = Icon === null ? null : (Icon ?? defaultIcons[variant] ?? Inbox);
  const isError = variant === "error";

  return (
    <div
      className={cn(variantStyles[variant], "text-center", className)}
      role={isError ? "alert" : "status"}
      aria-live="polite"
    >
      {ResolvedIcon ? (
        <ResolvedIcon
          className={cn(
            "mx-auto mb-4 h-10 w-10",
            isError ? "text-theme-accent" : "text-theme-faint",
          )}
          aria-hidden
        />
      ) : null}
      <h3 className="text-base font-semibold text-theme-primary">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-theme-muted">{description}</p>
      {onRetry ? (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={onRetry}
            className="ms-btn-ghost inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm"
          >
            {retryLabel}
          </button>
        </div>
      ) : null}
      {action && !onRetry ? <div className="mt-5 flex justify-center">{action}</div> : null}
      {action && onRetry ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}
