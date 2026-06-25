import type { ReactNode } from "react";

export function FilterField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className}`.trim()}>
      <span className="text-xs font-medium text-theme-muted">{label}</span>
      {children}
    </label>
  );
}
