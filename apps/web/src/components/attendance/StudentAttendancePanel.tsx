'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Bell, CalendarDays, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { EmptyState } from '@makyschool/ui/components/ui/EmptyState';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { StatusBanner } from '@makyschool/ui/components/ui/StatusBanner';
import { useStudentAttendanceDossier } from '@/hooks/useAttendance';
import { useCurrentTerm } from '@/hooks/useCurrentTerm';
import { todayEAT } from '@/lib/api/attendance';
import {
  AttendanceRiskBadge,
  formatAttendanceDate,
} from '@/components/attendance/AttendanceRiskBadge';
import { NotifyParentPanel } from '@/components/attendance/NotifyParentPanel';
import type { AttendanceDayStatus } from '@makyschool/shared';

const DAY_DOT: { [K in AttendanceDayStatus]: string } = {
  present: 'bg-[var(--color-success-dot)]',
  late: 'bg-[var(--color-warning-dot)]',
  absent: 'bg-[var(--color-danger-dot)]',
  partial: 'bg-theme-accent',
  none: 'bg-theme-raised',
};

/** Ensure YYYY-MM-DD from is never after to (e.g. future term start vs today). */
function clampFromTo(from: string, to: string): string {
  if (!from) return to;
  if (!to) return from;
  return from > to ? to : from;
}

export function StudentAttendancePanel({
  studentId,
  compact = false,
  showNotify = true,
}: {
  studentId: string;
  compact?: boolean;
  showNotify?: boolean;
}) {
  const { data: term } = useCurrentTerm();
  const termId = term?.id ?? '';
  const today = todayEAT();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState(today);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyDate, setNotifyDate] = useState(today);

  useEffect(() => {
    if (!term?.startDate) return;
    setDateFrom((prev) => {
      if (prev) return clampFromTo(prev, dateTo || today);
      return clampFromTo(term.startDate!, dateTo || today);
    });
  }, [term?.startDate, dateTo, today]);

  const effectiveFrom = clampFromTo(dateFrom || term?.startDate || '', dateTo || today);
  const effectiveTo = dateTo || today;
  const rangeReady = !!effectiveFrom && !!effectiveTo && effectiveFrom <= effectiveTo;

  const { data, isPending, isError, error, refetch, isFetching } = useStudentAttendanceDossier(
    studentId,
    termId,
    effectiveFrom,
    effectiveTo,
    !!studentId && !!termId && rangeReady,
  );

  const chartData = useMemo(
    () =>
      (data?.weeklyTrend ?? []).map((w) => ({
        ...w,
        label: formatAttendanceDate(w.weekStart).replace(/ \d{4}$/, ''),
      })),
    [data?.weeklyTrend],
  );

  if (!termId) {
    return (
      <EmptyState
        title="No current term"
        description="Set the current academic term to view attendance trends."
      />
    );
  }

  if (isPending && !data) {
    return <StudentAttendanceSkeleton compact={compact} />;
  }

  if (isError || !data) {
    return (
      <EmptyState
        variant="error"
        title="Couldn’t load attendance"
        description={error instanceof Error ? error.message : 'Please try again.'}
        onRetry={() => void refetch()}
      />
    );
  }

  const { kpis, guardian } = data;

  return (
    <div className="space-y-5">
      {!compact && (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="flex flex-wrap gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                From
              </span>
              <input
                type="date"
                className="ms-input"
                value={effectiveFrom}
                max={effectiveTo}
                onChange={(e) => setDateFrom(clampFromTo(e.target.value, effectiveTo))}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                To
              </span>
              <input
                type="date"
                className="ms-input"
                value={effectiveTo}
                min={effectiveFrom}
                max={today}
                onChange={(e) => {
                  const nextTo = e.target.value || today;
                  setDateTo(nextTo);
                  setDateFrom((prev) => clampFromTo(prev || effectiveFrom, nextTo));
                }}
              />
            </label>
          </div>
          {showNotify ? (
            <button
              type="button"
              className="ms-btn-secondary inline-flex items-center gap-2"
              onClick={() => {
                setNotifyDate(effectiveTo);
                setNotifyOpen(true);
              }}
              disabled={!guardian.canNotify}
            >
              <Bell className="h-4 w-4" />
              Notify parent
            </button>
          ) : null}
        </div>
      )}

      {isFetching && data ? (
        <p className="text-xs text-theme-muted">Refreshing…</p>
      ) : null}

      {/* KPI strip */}
      <div className={`grid gap-3 ${compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'}`}>
        <KpiCard
          label="Attendance rate"
          value={`${kpis.attendanceRate}%`}
          accent={
            kpis.attendanceRate >= 90
              ? 'text-theme-success'
              : kpis.attendanceRate >= 75
                ? 'text-theme-warning'
                : 'text-theme-danger'
          }
          footer={<AttendanceRiskBadge level={kpis.riskLevel} />}
        />
        <KpiCard label="Days attended" value={`${kpis.daysAttended}/${kpis.schoolDays}`} />
        <KpiCard
          label="Absent days"
          value={kpis.daysAbsent}
          accent={kpis.daysAbsent > 0 ? 'text-theme-danger' : undefined}
        />
        <KpiCard label="Late days" value={kpis.daysLate} accent="text-theme-warning" />
        {!compact && (
          <KpiCard
            label="Consecutive absences"
            value={kpis.consecutiveAbsentDays}
            accent={kpis.consecutiveAbsentDays >= 3 ? 'text-theme-danger' : undefined}
          />
        )}
      </div>

      {!compact && (
        <div className="grid gap-3 sm:grid-cols-3">
          <MiniStat icon={CheckCircle2} label="Present periods" value={kpis.periodsPresent} tone="success" />
          <MiniStat icon={Clock} label="Late periods" value={kpis.periodsLate} tone="warning" />
          <MiniStat icon={XCircle} label="Absent periods" value={kpis.periodsAbsent} tone="danger" />
        </div>
      )}

      {/* Trend chart */}
      {!compact && (
        <div className="rounded-xl border border-theme bg-theme-surface p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-theme-primary">Weekly attendance rate</h3>
              <p className="text-xs text-theme-muted">{data.termName}</p>
            </div>
            <CalendarDays className="h-4 w-4 text-theme-muted" />
          </div>
          {chartData.length === 0 ? (
            <p className="py-10 text-center text-sm text-theme-muted">No attendance recorded in this range.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" width={40} />
                <Tooltip formatter={(v: number) => [`${v}%`, 'Rate']} />
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke="var(--color-accent, #4f46e5)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Subject breakdown */}
      {!compact && data.bySubject.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
          <div className="border-b border-theme px-4 py-3">
            <h3 className="text-sm font-semibold text-theme-primary">By subject</h3>
            <p className="text-xs text-theme-muted">Period marks across the selected range</p>
          </div>
          <div className="overflow-x-auto">
            <table className="ms-table w-full min-w-[36rem]">
              <thead className="bg-table-header text-xs font-medium uppercase tracking-wide text-theme-muted">
                <tr>
                  <th className="px-4 py-3 text-left">Subject</th>
                  <th className="px-4 py-3 text-right">Present</th>
                  <th className="px-4 py-3 text-right">Late</th>
                  <th className="px-4 py-3 text-right">Absent</th>
                  <th className="px-4 py-3 text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.bySubject.map((row) => (
                  <tr key={row.subjectName} className="border-t border-theme">
                    <td className="px-4 py-3 font-medium text-theme-primary">{row.subjectName}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-theme-success">{row.present}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-theme-warning">{row.late}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-theme-danger">{row.absent}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-theme-primary">
                      {row.rate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent absences */}
      <div className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-theme px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-theme-primary">Recent absences</h3>
            <p className="text-xs text-theme-muted">Latest period absences in range</p>
          </div>
          {compact && showNotify && (
            <button
              type="button"
              className="ms-btn-secondary inline-flex items-center gap-1.5 text-xs"
              onClick={() => setNotifyOpen(true)}
              disabled={!guardian.canNotify}
            >
              <Bell className="h-3.5 w-3.5" />
              Notify
            </button>
          )}
        </div>
        {data.recentAbsences.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-theme-muted">
            No absences recorded in this period.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="ms-table w-full min-w-[40rem]">
              <thead className="bg-table-header text-xs font-medium uppercase tracking-wide text-theme-muted">
                <tr>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Subject</th>
                  <th className="px-4 py-3 text-left">Period</th>
                  <th className="px-4 py-3 text-left">Notes</th>
                  {!compact && showNotify ? <th className="px-4 py-3 text-right">Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {data.recentAbsences.slice(0, compact ? 5 : 20).map((row, idx) => (
                  <tr key={`${row.date}-${row.subjectName}-${idx}`} className="border-t border-theme">
                    <td className="px-4 py-3 text-sm text-theme-primary whitespace-nowrap">
                      {formatAttendanceDate(row.date)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-theme-primary">{row.subjectName}</td>
                    <td className="px-4 py-3 text-sm text-theme-muted">{row.periodLabel}</td>
                    <td className="px-4 py-3 text-sm italic text-theme-muted">
                      {row.notes || '—'}
                    </td>
                    {!compact && showNotify ? (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className="text-xs font-semibold text-theme-accent hover:underline"
                          disabled={!guardian.canNotify}
                          onClick={() => {
                            setNotifyDate(row.date);
                            setNotifyOpen(true);
                          }}
                        >
                          Notify
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Calendar strip */}
      {!compact && data.calendar.length > 0 && (
        <div className="rounded-xl border border-theme bg-theme-surface p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-theme-primary">Day status</h3>
          <p className="mb-3 text-xs text-theme-muted">Each recorded school day for this student</p>
          <div className="flex flex-wrap gap-1.5">
            {data.calendar.map((day) => (
              <span
                key={day.date}
                title={`${day.date}: ${day.dayStatus}`}
                className={`h-3.5 w-3.5 rounded-sm ${DAY_DOT[day.dayStatus]}`}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-theme-muted">
            {(
              [
                ['present', 'Present'],
                ['late', 'Late'],
                ['partial', 'Partial'],
                ['absent', 'Absent'],
              ] as const
            ).map(([key, label]) => (
              <span key={key} className="inline-flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-sm ${DAY_DOT[key]}`} />
                {label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Notification history */}
      {!compact && data.recentNotifications.length > 0 && (
        <div className="rounded-xl border border-theme bg-theme-surface p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-theme-primary">Parent notifications</h3>
          <ul className="mt-3 space-y-2">
            {data.recentNotifications.map((n) => (
              <li
                key={n.id}
                className="rounded-lg border border-theme bg-theme-raised px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-theme-primary capitalize">
                    {n.triggerType.replaceAll('_', ' ')}
                  </span>
                  <span className="text-xs text-theme-muted">
                    {formatAttendanceDate(n.attendanceDate)} · {n.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-theme-muted line-clamp-2">{n.messageBody}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showNotify && !guardian.canNotify && !compact && (
        <StatusBanner
          tone="info"
          message="Add a primary guardian phone on the student profile to enable parent SMS notices."
        />
      )}

      {showNotify ? (
        <NotifyParentPanel
          open={notifyOpen}
          onClose={() => setNotifyOpen(false)}
          studentId={studentId}
          studentName={data.studentName}
          className={data.className}
          guardian={guardian}
          defaultDate={notifyDate}
          defaultType="day_absent"
        />
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent,
  footer,
}: {
  label: string;
  value: string | number;
  accent?: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-theme bg-theme-surface p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${accent ?? 'text-theme-primary'}`}>
        {value}
      </p>
      {footer ? <div className="mt-2">{footer}</div> : null}
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  tone: 'success' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-theme-success'
      : tone === 'warning'
        ? 'text-theme-warning'
        : 'text-theme-danger';
  return (
    <div className="flex items-center gap-3 rounded-xl border border-theme bg-theme-surface px-4 py-3">
      <Icon className={`h-5 w-5 ${toneClass}`} />
      <div>
        <p className="text-xs text-theme-muted">{label}</p>
        <p className={`text-lg font-semibold tabular-nums ${toneClass}`}>{value}</p>
      </div>
    </div>
  );
}

function StudentAttendanceSkeleton({ compact }: { compact?: boolean }) {
  return (
    <div className="space-y-4">
      <div className={`grid gap-3 ${compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 lg:grid-cols-5'}`}>
        {Array.from({ length: compact ? 4 : 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      {!compact && <Skeleton className="h-56 rounded-xl" />}
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}
