'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, Users } from 'lucide-react';
import { EmptyState } from '@makyschool/ui/components/ui/EmptyState';
import { useMonthlyAttendance } from '@/hooks/useAttendance';
import type { AttendanceStatus } from '@makyschool/shared';
import { useTeacherClasses } from '@/hooks/useTeacherClasses';
import { useCurrentTerm } from '@/hooks/useCurrentTerm';
import { ATTENDANCE_STATUS_STYLE } from '@/components/attendance/attendanceStatusStyles';

const DOT: { [K in AttendanceStatus]: string } = {
  present: ATTENDANCE_STATUS_STYLE.present.dot,
  late: ATTENDANCE_STATUS_STYLE.late.dot,
  absent: ATTENDANCE_STATUS_STYLE.absent.dot,
};

function currentMonth() {
  return new Date()
    .toLocaleDateString('en-CA', {
      timeZone: 'Africa/Kampala',
    })
    .slice(0, 7);
}

export default function AttendanceHistoryPage() {
  const pathname = usePathname();
  const { data: classes = [] } = useTeacherClasses();
  const { data: term } = useCurrentTerm();

  const [selectedClassId, setSelectedClassId] = useState('');
  const [month, setMonth] = useState(currentMonth());

  const classId = selectedClassId || classes[0]?.id || '';
  const termId = term?.id ?? '';

  const { data, isPending, isError } = useMonthlyAttendance(
    classId,
    termId,
    month,
    !!classId && !!termId,
  );

  const days = data?.schoolDays ?? [];
  const rows = data?.rows ?? [];
  const dayNums = days.map((d) => ({ full: d, day: new Date(d).getDate() }));

  const columnTotals = useMemo(() => {
    const totals: {
      [key: string]: { present: number; late: number; absent: number };
    } = {};
    for (const day of days) {
      totals[day] = { present: 0, late: 0, absent: 0 };
    }
    for (const row of rows) {
      for (const day of days) {
        const status = row.days[day] as AttendanceStatus | undefined;
        if (status) totals[day][status]++;
      }
    }
    return totals;
  }, [days, rows]);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 p-3 sm:gap-5 sm:p-5 lg:p-6">
      <header className="flex flex-col gap-3 border-b border-theme pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-theme-primary sm:text-2xl">
              Attendance
            </h1>
            <nav className="flex gap-1 rounded-lg border border-theme bg-theme-raised/40 p-0.5">
              <Link
                href="/teacher/attendance"
                className={[
                  'rounded-md px-3 py-1.5 text-xs font-semibold transition sm:text-sm',
                  pathname === '/teacher/attendance'
                    ? 'bg-theme-accent text-on-accent shadow-sm'
                    : 'text-theme-muted hover:text-theme-primary',
                ].join(' ')}
              >
                Take
              </Link>
              <Link
                href="/teacher/attendance/history"
                className={[
                  'rounded-md px-3 py-1.5 text-xs font-semibold transition sm:text-sm',
                  pathname === '/teacher/attendance/history'
                    ? 'bg-theme-accent text-on-accent shadow-sm'
                    : 'text-theme-muted hover:text-theme-primary',
                ].join(' ')}
              >
                History
              </Link>
            </nav>
          </div>
          <p className="mt-1 text-xs text-theme-muted sm:text-sm">
            Monthly history for your assigned classes
          </p>
        </div>
      </header>

      {classes.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No Assigned Classes"
          description="You do not have any classes assigned. Contact your school administrator to configure your teaching load."
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-4 rounded-xl border border-theme bg-theme-raised/40 p-4 sm:items-end">
            <div className="flex min-w-[200px] flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                Class
              </label>
              <select
                className="ms-input cursor-pointer"
                value={classId}
                onChange={(e) => setSelectedClassId(e.target.value)}
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.level} {c.stream}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex min-w-[160px] flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                Month
              </label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="ms-input cursor-pointer"
              />
            </div>
          </div>

          <div className="flex w-fit flex-wrap gap-5 rounded-lg border border-theme bg-theme-raised/30 p-3 text-xs text-theme-muted">
            {(Object.entries(DOT) as [AttendanceStatus, string][]).map(
              ([s, cls]) => (
                <span key={s} className="flex items-center gap-2 font-medium capitalize">
                  <span className={`h-3 w-3 rounded-full shadow-sm ${cls}`} />
                  {s}
                </span>
              ),
            )}
            <span className="flex items-center gap-2 font-medium">
              <span className="h-3 w-3 rounded-full border border-theme bg-theme-raised" />
              Not recorded
            </span>
          </div>

          {isPending ? (
            <div className="h-64 animate-pulse rounded-xl border border-theme bg-theme-raised/50" />
          ) : isError ? (
            <div className="alert-error rounded-xl p-6 text-center text-sm font-medium shadow-sm">
              Failed to load history.
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No Records Found"
              description="No attendance records exist for this class in the selected month."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
              <div className="overflow-x-auto">
                <table className="ms-table w-full text-xs">
                  <thead className="bg-table-header">
                    <tr>
                      <th className="sticky left-0 z-20 border-r border-theme bg-table-header px-5 py-3.5 text-left font-semibold text-theme-muted">
                        Student
                      </th>
                      {dayNums.map(({ full, day }) => (
                        <th
                          key={full}
                          className="min-w-[2.5rem] px-2 py-3.5 text-center font-semibold text-theme-muted"
                          title={full}
                        >
                          {day}
                        </th>
                      ))}
                      <th className="w-24 px-5 py-3.5 text-center font-semibold text-theme-muted">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.studentId}
                        className="group border-t border-theme"
                      >
                        <td className="sticky left-0 z-10 border-r border-theme bg-theme-surface px-5 py-3 font-semibold text-theme-primary shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] group-hover:bg-theme-raised/40">
                          <div className="text-sm">{row.studentName}</div>
                          <div className="mt-0.5 font-mono text-[10px] font-normal text-theme-muted">
                            {row.learnerId}
                          </div>
                        </td>
                        {dayNums.map(({ full }) => {
                          const status = row.days[full] as
                            | AttendanceStatus
                            | undefined;
                          return (
                            <td key={full} className="px-2 py-3 text-center">
                              {status ? (
                                <span
                                  className={`mx-auto block h-3 w-3 cursor-help rounded-full shadow-sm transition-transform hover:scale-110 ${DOT[status]}`}
                                  title={`${row.studentName} was ${status} on ${full}`}
                                />
                              ) : (
                                <span className="mx-auto block h-3 w-3 rounded-full border border-theme bg-theme-raised" />
                              )}
                            </td>
                          );
                        })}
                        <td className="px-5 py-3 text-center font-bold text-theme-primary">
                          {row.daysAttended}
                          <span className="font-normal text-theme-faint">
                            /{row.totalDays}
                          </span>
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-theme bg-theme-raised/40">
                      <td className="sticky left-0 z-10 border-r border-theme bg-theme-raised/95 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-theme-primary">
                        Column totals
                      </td>
                      {dayNums.map(({ full }) => {
                        const t = columnTotals[full];
                        return (
                          <td key={full} className="px-1 py-2 text-center align-top">
                            <div className="flex flex-col items-center gap-0.5 text-[9px] font-medium leading-tight">
                              <span className="text-theme-success">
                                {t?.present ?? 0}P
                              </span>
                              <span className="text-theme-warning">
                                {t?.late ?? 0}L
                              </span>
                              <span className="text-theme-danger">
                                {t?.absent ?? 0}A
                              </span>
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-5 py-3 text-center text-theme-muted">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
