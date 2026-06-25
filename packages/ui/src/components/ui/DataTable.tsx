import type { ReactNode } from "react";

export function DataTable({
  children,
  className = "",
  minWidth = "40rem",
}: {
  children: ReactNode;
  className?: string;
  minWidth?: string;
}) {
  return (
    <div className={`ms-table-shell overflow-x-auto ${className}`.trim()}>
      <table className="ms-table w-full" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}
