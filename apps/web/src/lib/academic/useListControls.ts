"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
  const [query, setQueryState] = useState("");
  const [page, setPage] = useState(1);
  const resetSignature = JSON.stringify(resetDeps);

  const setQuery = useCallback((value: string) => {
    setQueryState(value);
    setPage(1);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setPage(1), 0);
    return () => window.clearTimeout(timer);
  }, [resetSignature]);

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
