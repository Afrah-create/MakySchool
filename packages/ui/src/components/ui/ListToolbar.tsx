import type { ReactNode } from "react";
import { Search } from "lucide-react";

export function ListToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search…",
  actions,
  children,
}: {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const showSearch = onSearchChange !== undefined;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-theme bg-theme-surface p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
      {showSearch ? (
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-muted"
            aria-hidden
          />
          <input
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="ms-input w-full py-2.5 pl-10"
            aria-label={searchPlaceholder}
          />
        </div>
      ) : null}

      <div
        className={`flex flex-wrap items-center gap-2 ${showSearch ? "sm:justify-end" : "w-full justify-between"}`}
      >
        {children}
        {actions}
      </div>
    </div>
  );
}
