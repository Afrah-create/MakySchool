import { cn } from "@/lib/utils/cn";

const sizeClass = {
  sm: "h-3.5 w-3.5 border-[1.5px]",
  md: "h-4 w-4 border-2",
  lg: "h-6 w-6 border-2",
} as const;

type SpinnerTone = "accent" | "muted" | "onAccent";

const toneClass: Record<SpinnerTone, string> = {
  accent: "border-theme-accent/25 border-t-theme-accent",
  muted: "border-theme-icon border-t-theme-muted",
  onAccent: "border-on-accent/30 border-t-on-accent",
};

export function Spinner({
  size = "md",
  tone = "accent",
  label,
  className,
}: {
  size?: keyof typeof sizeClass;
  tone?: SpinnerTone;
  label?: string;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label={label ?? "Loading"}
      className={cn(
        "inline-block shrink-0 animate-spin rounded-full motion-reduce:animate-none motion-reduce:opacity-70",
        sizeClass[size],
        toneClass[tone],
        className,
      )}
    />
  );
}
