'use client';

import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { AttendanceStatus } from '@makyschool/shared';

export type AttendanceStatusStyle = {
  label: string;
  icon: typeof CheckCircle2;
  /** Combined pill classes (bg + text). */
  badge: string;
  text: string;
  softBtn: string;
  softBtnActive: string;
  bar: string;
  dot: string;
};

export const ATTENDANCE_STATUS_STYLE: {
  [K in AttendanceStatus]: AttendanceStatusStyle;
} = {
  present: {
    label: 'Present',
    icon: CheckCircle2,
    badge: 'badge-success',
    text: 'text-theme-success',
    softBtn:
      'border-theme bg-theme-surface text-theme-muted hover:bg-theme-raised hover:text-theme-primary',
    softBtnActive: 'border-transparent badge-success ring-1 ring-inset ring-black/5 dark:ring-white/10',
    bar: 'bg-[var(--color-success-dot)]',
    dot: 'bg-[var(--color-success-dot)]',
  },
  late: {
    label: 'Late',
    icon: Clock,
    badge: 'badge-warning',
    text: 'text-theme-warning',
    softBtn:
      'border-theme bg-theme-surface text-theme-muted hover:bg-theme-raised hover:text-theme-primary',
    softBtnActive: 'border-transparent badge-warning ring-1 ring-inset ring-black/5 dark:ring-white/10',
    bar: 'bg-[var(--color-warning-dot)]',
    dot: 'bg-[var(--color-warning-dot)]',
  },
  absent: {
    label: 'Absent',
    icon: XCircle,
    badge: 'badge-danger',
    text: 'text-theme-danger',
    softBtn:
      'border-theme bg-theme-surface text-theme-muted hover:bg-theme-raised hover:text-theme-primary',
    softBtnActive: 'border-transparent badge-danger ring-1 ring-inset ring-black/5 dark:ring-white/10',
    bar: 'bg-[var(--color-danger-dot)]',
    dot: 'bg-[var(--color-danger-dot)]',
  },
};

export const ATTENDANCE_STATUS_KEYS = [
  'present',
  'late',
  'absent',
] as const satisfies readonly AttendanceStatus[];

export function AttendanceStatusBadge({
  status,
  className = '',
}: {
  status: AttendanceStatus | null | undefined;
  className?: string;
}) {
  if (!status) {
    return (
      <span className={`text-xs text-theme-faint ${className}`.trim()}>— not marked</span>
    );
  }
  const cfg = ATTENDANCE_STATUS_STYLE[status];
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
        cfg.badge,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <cfg.icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

export function AttendanceTallyPill({
  status,
  count,
}: {
  status: AttendanceStatus;
  count: number;
}) {
  const cfg = ATTENDANCE_STATUS_STYLE[status];
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
        cfg.badge,
      ].join(' ')}
    >
      <cfg.icon className="h-3.5 w-3.5" />
      {count} {cfg.label}
    </span>
  );
}

export function studentInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}
