import type { ReactNode } from "react";

export function DataListPanel({
  toolbar,
  footer,
  children,
  className = "",
}: {
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-theme bg-theme-surface ${className}`.trim()}
    >
      {toolbar ? (
        <div className="border-b border-theme px-4 py-4 sm:px-5">{toolbar}</div>
      ) : null}
      {children}
      {footer ? (
        <div className="border-t border-theme px-4 py-3 sm:px-5">{footer}</div>
      ) : null}
    </div>
  );
}
