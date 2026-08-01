'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@makyschool/ui/components/ui/PageHeader';
import { EmptyState } from '@makyschool/ui/components/ui/EmptyState';
import { LoadingButton } from '@makyschool/ui/components/ui/LoadingButton';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { CanDo } from '@/components/ui/CanDo';
import { ManualMarkDialog } from '@/components/school-admin/teacher-attendance/ManualMarkDialog';
import { useTeacherAttendanceDetail } from '@/hooks/useTeacherAttendance';

function formatClock(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(minutes: number | null) {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function dayTone(status: string | undefined, isWeekend: boolean, isFuture: boolean) {
  if (isFuture) return 'bg-theme-surface border border-theme text-theme-faint';
  if (isWeekend) return 'bg-theme-raised text-theme-muted';
  switch (status) {
    case 'present':
      return 'bg-theme-success-bg text-theme-success';
    case 'late':
    case 'outside_fence':
      return 'bg-theme-warning-bg text-theme-warning';
    case 'absent':
      return 'bg-theme-danger-bg text-theme-danger';
    default:
      return 'bg-theme-raised text-theme-muted';
  }
}

export function TeacherAttendanceDetailContent({
  teacherId,
}: {
  teacherId: string;
}) {
  const now = new Date();
  const [monthKey, setMonthKey] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
  );
  const { data, isLoading, isError, refetch } = useTeacherAttendanceDetail(
    teacherId,
    monthKey,
  );
  const [manualOpen, setManualOpen] = useState(false);

  const byDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of data?.records ?? []) {
      map.set(r.date, r.status);
    }
    return map;
  }, [data?.records]);

  const calendarDays = useMemo(() => {
    const [y, m] = monthKey.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const startPad = (first.getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(y, m, 0).getDate();
    const cells: Array<{
      day: number | null;
      dateStr?: string;
      isWeekend?: boolean;
      isFuture?: boolean;
      status?: string;
    }> = [];
    for (let i = 0; i < startPad; i++) cells.push({ day: null });
    const todayStr = new Date().toISOString().slice(0, 10);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${monthKey}-${String(d).padStart(2, '0')}`;
      const weekday = new Date(y, m - 1, d).getDay();
      cells.push({
        day: d,
        dateStr,
        isWeekend: weekday === 0 || weekday === 6,
        isFuture: dateStr > todayStr,
        status: byDate.get(dateStr),
      });
    }
    return cells;
  }, [monthKey, byDate]);

  function shiftMonth(delta: number) {
    const [y, m] = monthKey.split('-').map(Number);
    const dt = new Date(y, m - 1 + delta, 1);
    setMonthKey(
      `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`,
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <EmptyState
          variant="error"
          title="Couldn’t load teacher"
          description="Check your connection and try again."
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const s = data.month_summary;
  const t = data.teacher;

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <PageHeader
        title={t.full_name}
        description={[t.subject_specialization, ...(t.classes ?? [])]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/teacher-attendance" className="ms-btn-ghost">
              Back
            </Link>
            <CanDo action="manualMarkAttendance">
              <LoadingButton variant="primary" onClick={() => setManualOpen(true)}>
                Manual entry
              </LoadingButton>
            </CanDo>
          </div>
        }
      />

      <div className="flex items-center justify-between gap-3">
        <LoadingButton variant="ghost" onClick={() => shiftMonth(-1)}>
          Previous
        </LoadingButton>
        <p className="font-semibold text-theme-primary">{s.month}</p>
        <LoadingButton variant="ghost" onClick={() => shiftMonth(1)}>
          Next
        </LoadingButton>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-theme bg-theme-surface px-4 py-3">
          <p className="text-[11px] font-semibold uppercase text-theme-muted">
            Working days
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{s.working_days}</p>
        </div>
        <div className="rounded-xl border border-theme bg-theme-surface px-4 py-3">
          <p className="text-[11px] font-semibold uppercase text-theme-muted">
            Present
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-theme-success">
            {s.present} ({s.attendance_percent}%)
          </p>
        </div>
        <div className="rounded-xl border border-theme bg-theme-surface px-4 py-3">
          <p className="text-[11px] font-semibold uppercase text-theme-muted">Late</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-theme-warning">
            {s.late}
          </p>
        </div>
        <div className="rounded-xl border border-theme bg-theme-surface px-4 py-3">
          <p className="text-[11px] font-semibold uppercase text-theme-muted">
            Avg clock-in
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {s.average_clock_in ?? '—'}
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-theme bg-theme-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-theme-primary">
          Monthly heatmap
        </h2>
        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-theme-muted">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((cell, idx) =>
            cell.day == null ? (
              <div key={`pad-${idx}`} className="h-8" />
            ) : (
              <div
                key={cell.dateStr}
                title={`${cell.dateStr}: ${cell.status ?? (cell.isWeekend ? 'weekend' : '—')}`}
                className={`flex h-8 items-center justify-center rounded-md text-xs font-medium tabular-nums ${dayTone(
                  cell.status,
                  !!cell.isWeekend,
                  !!cell.isFuture,
                )}`}
              >
                {cell.day}
              </div>
            ),
          )}
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl border border-theme bg-theme-surface">
        <table className="ms-table ms-table-compact w-full min-w-[36rem]">
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              <th>Clock in</th>
              <th>Clock out</th>
              <th>Duration</th>
              <th>Distance</th>
              <th>Manual</th>
            </tr>
          </thead>
          <tbody>
            {data.records.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-theme-muted">
                  No records this month.
                </td>
              </tr>
            ) : (
              data.records.map((r) => (
                <tr key={r.date}>
                  <td>{r.date}</td>
                  <td className="capitalize">{r.status.replace('_', ' ')}</td>
                  <td className="tabular-nums">{formatClock(r.clock_in_at)}</td>
                  <td className="tabular-nums">{formatClock(r.clock_out_at)}</td>
                  <td className="tabular-nums">
                    {formatDuration(r.duration_minutes)}
                  </td>
                  <td className="tabular-nums">
                    {r.clock_in_distance_metres != null
                      ? `${Math.round(r.clock_in_distance_metres)}m`
                      : '—'}
                  </td>
                  <td>{r.is_manual ? r.manual_reason || '✓' : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <ManualMarkDialog
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        teacherId={teacherId}
        teacherName={t.full_name}
      />
    </div>
  );
}
