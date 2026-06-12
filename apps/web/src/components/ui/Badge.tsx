import type { ReactNode } from "react";

const variants = {
  neutral: "border border-theme bg-theme-raised text-theme-muted",
  success: "badge-success border border-transparent",
  warning: "badge-warning border border-transparent",
  danger: "badge-danger border border-transparent",
  info: "badge-info border border-transparent",
} as const;

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof variants }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${variants[tone]}`}>
      {children}
    </span>
  );
}
