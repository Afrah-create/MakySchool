"use client";

import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function AssignmentModeSwitch({
  mode,
  onChange,
}: {
  mode: "by-subject" | "by-class";
  onChange: (mode: "by-subject" | "by-class") => void;
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-theme bg-input p-1">
      {(
        [
          { id: "by-subject" as const, label: "By subject", hint: "Bulk link one subject to many classes" },
          { id: "by-class" as const, label: "By class", hint: "Link subjects to one class at a time" },
        ] as const
      ).map((option) => (
        <button
          key={option.id}
          type="button"
          title={option.hint}
          onClick={() => onChange(option.id)}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition",
            mode === option.id
              ? "bg-theme-surface text-theme-primary shadow-theme-card"
              : "text-theme-muted hover:text-theme-primary",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function AssignmentWorkspace({
  mode,
  onModeChange,
  children,
}: {
  mode: "by-subject" | "by-class";
  onModeChange: (mode: "by-subject" | "by-class") => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="ms-card flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-theme-primary">Link subjects to classes</h2>
          <p className="mt-1 text-sm text-theme-muted">
            {mode === "by-subject"
              ? "Pick a subject, select classes, then save. Best for assigning one subject across many levels."
              : "Pick a class and toggle subjects on or off. Changes save immediately."}
          </p>
        </div>
        <AssignmentModeSwitch mode={mode} onChange={onModeChange} />
      </div>
      {children}
    </div>
  );
}

export function AssignmentSplitLayout({
  picker,
  detail,
}: {
  picker: ReactNode;
  detail: ReactNode;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      {picker}
      {detail}
    </div>
  );
}

export function AssignmentPickerPanel({
  title,
  count,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  children,
}: {
  title: string;
  count?: number;
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <section className="ms-card flex max-h-[calc(100dvh-14rem)] flex-col overflow-hidden">
      <div className="shrink-0 border-b border-theme px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-theme-primary">{title}</h3>
          {count !== undefined ? (
            <span className="rounded-full bg-theme-accent-muted px-2 py-0.5 text-xs font-medium tabular-nums text-theme-accent">
              {count}
            </span>
          ) : null}
        </div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-muted" />
          <input
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="ms-input w-full py-2 pl-9 pr-3 text-sm"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">{children}</div>
    </section>
  );
}

export function AssignmentPickerItem({
  active,
  title,
  subtitle,
  badge,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "mb-1 flex w-full items-start justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition",
        active
          ? "border-accent-soft bg-theme-accent-muted"
          : "border-transparent hover:border-theme hover:bg-nav-hover",
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-theme-primary">{title}</p>
        <p className="mt-0.5 truncate text-xs text-theme-muted">{subtitle}</p>
      </div>
      {badge ? (
        <span className="shrink-0 rounded-full bg-theme-raised px-2 py-0.5 text-[10px] font-medium tabular-nums text-theme-muted">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export function AssignmentDetailPanel({
  title,
  description,
  stats,
  actions,
  toolbar,
  footer,
  children,
}: {
  title: string;
  description?: string;
  stats?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ms-card flex max-h-[calc(100dvh-14rem)] flex-col overflow-hidden">
      <div className="shrink-0 border-b border-theme px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-theme-primary">{title}</h3>
            {description ? <p className="mt-1 text-sm text-theme-muted">{description}</p> : null}
            {stats ? <div className="mt-2">{stats}</div> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
        {toolbar ? <div className="mt-4">{toolbar}</div> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      {footer}
    </section>
  );
}

export function AssignmentLinkToggle({
  linked,
  disabled,
  loading,
  onToggle,
  label,
}: {
  linked: boolean;
  disabled?: boolean;
  loading?: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onToggle}
      aria-pressed={linked}
      aria-label={label}
      className={cn(
        "inline-flex min-w-[5.5rem] items-center justify-center rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50",
        linked
          ? "bg-theme-accent text-on-accent shadow-theme-accent"
          : "border border-theme bg-input text-theme-muted hover:border-theme-strong hover:text-theme-primary",
      )}
    >
      {loading ? "…" : linked ? "Linked" : "Link"}
    </button>
  );
}

export function AssignmentSaveBar({
  dirty,
  summary,
  onDiscard,
  onSave,
  saving,
  saveDisabled,
}: {
  dirty: boolean;
  summary: string;
  onDiscard: () => void;
  onSave: () => void;
  saving: boolean;
  saveDisabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "shrink-0 border-t border-theme px-5 py-3",
        dirty ? "bg-theme-accent-muted/40" : "bg-theme-surface",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className={cn("text-sm", dirty ? "font-medium text-theme-primary" : "text-theme-muted")}>
          {summary}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={onDiscard}
            className="ms-btn-ghost rounded-lg px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Discard
          </button>
          <button
            type="button"
            disabled={!dirty || saving || saveDisabled}
            onClick={onSave}
            className="ms-btn-primary rounded-lg px-4 py-1.5 text-sm disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
