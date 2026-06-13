"use client";

import { useEffect, useMemo, useState } from "react";

export function useListControls<T>({
  items,
  pageSize = 15,
  filterFn,
  resetDeps = [],
}: {
  items: T[];
  pageSize?: number;
  filterFn: (item: T, query: string) => boolean;
  resetDeps?: unknown[];
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () => items.filter((item) => filterFn(item, query.trim().toLowerCase())),
    [items, query, filterFn],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const paged = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [query, ...resetDeps]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const rangeStart = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, filtered.length);

  return {
    query,
    setQuery,
    page: safePage,
    setPage,
    totalPages,
    paged,
    filteredCount: filtered.length,
    totalCount: items.length,
    rangeStart,
    rangeEnd,
    hasFilters: query.trim().length > 0,
    clearFilters: () => setQuery(""),
  };
}
