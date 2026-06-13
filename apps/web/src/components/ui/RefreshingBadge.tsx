import { Spinner } from "@/components/ui/Spinner";

export function RefreshingBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-theme-accent-muted px-2.5 py-0.5 text-xs font-medium text-theme-muted"
      role="status"
      aria-live="polite"
    >
      <Spinner size="sm" tone="accent" />
      Refreshing…
    </span>
  );
}
