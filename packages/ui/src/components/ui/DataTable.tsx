import type { ReactNode } from "react";

export function DataTable({
  children,
  className = "",
  minWidth = "40rem",
  embedded = false,
}: {
  children: ReactNode;
  className?: string;
  minWidth?: string;
  embedded?: boolean;
}) {
  const table = (
    <table className="ms-table w-full" style={{ minWidth }}>
      {children}
    </table>
  );

  if (embedded) {
    return (
      <div className={`overflow-x-auto ${className}`.trim()}>{table}</div>
    );
  }

  return (
    <div className={`ms-table-shell overflow-x-auto ${className}`.trim()}>{table}</div>
  );
}
