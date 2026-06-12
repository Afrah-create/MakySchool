import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-theme bg-theme-surface px-6 py-10 text-center shadow-theme-card">
      <h3 className="text-base font-semibold text-theme-primary">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-theme-muted">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
