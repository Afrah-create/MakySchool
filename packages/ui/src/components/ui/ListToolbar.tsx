import type { ReactNode } from "react";
import { Search } from "lucide-react";

export function ListToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search…",
  actions,
  filters,
}: {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  actions?: ReactNode;
  filters?: ReactNode;
}) {
  const showSearch = onSearchChange !== undefined;
  const showTopRow = showSearch || actions;

  return (
    <div className="space-y-4">
      {showTopRow ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {showSearch ? (
            <div className="relative min-w-0 flex-1 sm:max-w-sm lg:max-w-md">
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

          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:ml-auto">{actions}</div>
          ) : null}
        </div>
      ) : null}

      {filters ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
          {filters}
        </div>
      ) : null}
    </div>
  );
}
