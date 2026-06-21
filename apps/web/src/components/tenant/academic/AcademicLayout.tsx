"use client";

import type { ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@makyschool/ui/lib/cn";

export function AcademicTabNav<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: T; label: string; count?: number }>;
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl border border-theme bg-input p-1">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition",
              isActive
                ? "bg-theme-surface text-theme-primary shadow-theme-card"
                : "text-theme-muted hover:bg-nav-hover hover:text-theme-primary",
            )}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs tabular-nums",
                  isActive ? "bg-theme-accent-muted text-theme-accent" : "bg-theme-raised text-theme-muted",
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function AcademicSummaryCards({
  items,
}: {
  items: Array<{
    key: string;
    label: string;
    value: number | string;
    hint?: string;
    tone?: "default" | "warning" | "success";
  }>;
}) {
  const toneClass = {
    default: "text-theme-primary",
    warning: "text-amber-600 dark:text-amber-400",
    success: "text-theme-accent",
  } as const;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.key} className="ms-card px-4 py-3.5">
          <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">{item.label}</p>
          <p className={cn("mt-1 text-2xl font-semibold tabular-nums", toneClass[item.tone ?? "default"])}>
            {item.value}
          </p>
          {item.hint ? <p className="mt-0.5 text-xs text-theme-muted">{item.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}

export function AcademicToolbar({
  searchPlaceholder,
  searchValue,
  onSearchChange,
  filters,
  actions,
}: {
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  filters?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-theme px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <input
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="ms-input w-full py-2 pl-3 pr-3 text-sm"
            aria-label={searchPlaceholder}
          />
        </div>
        {filters ? <div className="flex flex-wrap items-center gap-2">{filters}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function AcademicTableShell({
  toolbar,
  footer,
  children,
  maxHeight = "min(36rem, calc(100dvh - 18rem))",
}: {
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  maxHeight?: string;
}) {
  return (
    <section className="ms-card overflow-hidden">
      {toolbar}
      <div className="overflow-auto" style={{ maxHeight }}>
        {children}
      </div>
      {footer}
    </section>
  );
}

export function AcademicPagination({
  rangeStart,
  rangeEnd,
  total,
  page,
  totalPages,
  onPageChange,
}: {
  rangeStart: number;
  rangeEnd: number;
  total: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (total === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 border-t border-theme px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-theme-muted">
        Showing <span className="font-medium text-theme-primary">{rangeStart}–{rangeEnd}</span> of{" "}
        <span className="font-medium text-theme-primary">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="ms-btn-ghost rounded-lg px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Previous
        </button>
        <span className="px-2 text-sm tabular-nums text-theme-muted">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="ms-btn-ghost rounded-lg px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function AcademicFilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label}
      className="ms-select py-2 text-sm"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function RowActions({
  onEdit,
  onDelete,
  editLabel = "Edit",
  deleteLabel = "Delete",
}: {
  onEdit: () => void;
  onDelete: () => void;
  editLabel?: string;
  deleteLabel?: string;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={onEdit}
        title={editLabel}
        aria-label={editLabel}
        className="rounded-lg p-2 text-theme-muted transition hover:bg-nav-hover hover:text-theme-primary"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        title={deleteLabel}
        aria-label={deleteLabel}
        className="rounded-lg p-2 text-theme-muted transition hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
