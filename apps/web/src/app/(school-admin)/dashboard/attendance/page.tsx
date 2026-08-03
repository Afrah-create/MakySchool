'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  CalendarDays,
  ShieldCheck,
  Search,
  Loader2,
  AlertCircle,
  Inbox,
  BarChart3,
  ClipboardList,
} from 'lucide-react';
import { EmptyState } from '@makyschool/ui/components/ui/EmptyState';
import { TablePagination } from '@makyschool/ui/components/ui/TablePagination';
import { useDailyAttendanceByClass, useAttendanceAdminOverview } from '@/hooks/useAttendance';
import { todayEAT } from '@/lib/api/attendance';
import { useCurrentTerm } from '@/hooks/useCurrentTerm';
import {
  AttendanceAdminKpis,
  AttendanceAdminKpisSkeleton,
} from '@/components/school-admin/attendance/AttendanceAdminKpis';
import {
  AttendanceAdminCharts,
  AttendanceAdminChartsSkeleton,
} from '@/components/school-admin/attendance/AttendanceAdminCharts';
import {
  AttendanceStatusBadge,
  ATTENDANCE_STATUS_STYLE,
  studentInitials,
} from '@/components/attendance/attendanceStatusStyles';
import { useClientPagination } from '@/hooks/useClientPagination';

interface SchoolClassStream {
  id: string;
  level: string;
  stream: string;
}

type TabId = 'daily' | 'analytics';

export default function SchoolAdminAttendancePage() {
  const { data: term } = useCurrentTerm();
  const [activeTab, setActiveTab] = useState<TabId>('daily');

  const [selectedDate, setSelectedDate] = useState(todayEAT());
  const [selectedClassId, setSelectedClassId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [classes, setClasses] = useState<SchoolClassStream[]>([]);
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [classesError, setClassesError] = useState(false);

  const [analyticsClassId, setAnalyticsClassId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState(todayEAT());

  useEffect(() => {
    let cancelled = false;
    async function fetchStreams() {
      setIsLoadingClasses(true);
      setClassesError(false);
      try {
        const res = await fetch('/api/schools/classes');
        if (!res.ok) throw new Error(`Request failed with ${res.status}`);
        const payload = await res.json();
        if (cancelled) return;
        if (payload?.data) {
          setClasses(payload.data);
          if (payload.data.length > 0) {
            setSelectedClassId((prev) => prev || payload.data[0].id);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed fetching administrative stream records', err);
          setClassesError(true);
        }
      } finally {
        if (!cancelled) setIsLoadingClasses(false);
      }
    }
    fetchStreams();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (term?.startDate) {
      setDateFrom((prev) => {
        if (prev) return prev > dateTo ? dateTo : prev;
        return term.startDate! > dateTo ? dateTo : term.startDate!;
      });
    } else if (!dateFrom) {
      const d = new Date();
      d.setDate(1);
      const monthStart = d.toLocaleDateString('en-CA', { timeZone: 'Africa/Kampala' });
      setDateFrom(monthStart > dateTo ? dateTo : monthStart);
    }
  }, [term?.startDate, dateFrom, dateTo]);

  const termId = term?.id ?? '';
  const queryEnabled = !!selectedClassId && !!termId;

  const { data, isPending: isPendingAttendance, isError } = useDailyAttendanceByClass(
    selectedClassId,
    termId,
    selectedDate,
    queryEnabled && activeTab === 'daily',
  );

  const analyticsEnabled =
    activeTab === 'analytics' && !!termId && !!dateFrom && !!dateTo;

  const {
    data: overview,
    isPending: isPendingOverview,
    isError: isOverviewError,
  } = useAttendanceAdminOverview(
    termId,
    dateFrom,
    dateTo,
    analyticsClassId,
    analyticsEnabled,
  );

  const selectedClass = classes.find((c) => c.id === selectedClassId);
  const isPending = isLoadingClasses || (queryEnabled && isPendingAttendance);

  const stats = useMemo(() => {
    if (!data?.students) {
      return { total: 0, present: 0, late: 0, absent: 0, unmarked: 0, rate: 0 };
    }
    const totals = {
      total: data.students.length,
      present: 0,
      late: 0,
      absent: 0,
      unmarked: 0,
    };

    data.students.forEach((s) => {
      if (s.status === 'present') totals.present++;
      else if (s.status === 'late') totals.late++;
      else if (s.status === 'absent') totals.absent++;
      else totals.unmarked++;
    });

    const attended = totals.present + totals.late;
    const rate = totals.total > 0 ? Math.round((attended / totals.total) * 100) : 0;
    return { ...totals, rate };
  }, [data]);

  const filteredStudents = useMemo(() => {
    if (!data?.students) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return data.students;
    return data.students.filter(
      (s) =>
        s.studentName.toLowerCase().includes(q) ||
        s.learnerId.toLowerCase().includes(q),
    );
  }, [data, searchQuery]);

  const {
    paged: pagedStudents,
    page,
    setPage,
    pageSize,
    setPageSize,
    total: filteredTotal,
  } = useClientPagination({
    items: filteredStudents,
    resetDeps: [selectedDate, selectedClassId, searchQuery],
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-2 border-b border-theme pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-theme-accent-muted">
            <ShieldCheck className="h-5 w-5 text-theme-accent" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-theme-primary sm:text-2xl">
              School Attendance Registry
            </h1>
            <p className="text-xs text-theme-muted">
              Review daily attendance and school-wide trends across every class stream.
            </p>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('daily')}
            className={[
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200',
              activeTab === 'daily'
                ? 'bg-theme-accent text-on-accent shadow-sm'
                : 'text-theme-muted hover:bg-nav-hover hover:text-theme-primary',
            ].join(' ')}
          >
            <ClipboardList className="h-4 w-4" />
            Daily Register
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('analytics')}
            className={[
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200',
              activeTab === 'analytics'
                ? 'bg-theme-accent text-on-accent shadow-sm'
                : 'text-theme-muted hover:bg-nav-hover hover:text-theme-primary',
            ].join(' ')}
          >
            <BarChart3 className="h-4 w-4" />
            Analytics
          </button>
        </div>
      </div>

      {activeTab === 'analytics' ? (
        <div className="space-y-6">
          <div className="flex flex-col flex-wrap gap-4 rounded-xl border border-theme bg-theme-raised/40 p-4 sm:flex-row sm:items-end">
            <div className="flex flex-col gap-1.5 sm:min-w-[160px]">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                From
              </label>
              <input
                type="date"
                max={dateTo || todayEAT()}
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="ms-input"
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:min-w-[160px]">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                To
              </label>
              <input
                type="date"
                max={todayEAT()}
                min={dateFrom}
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="ms-input"
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:min-w-[220px]">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                Class filter
              </label>
              <select
                className="ms-input w-full"
                value={analyticsClassId}
                onChange={(e) => setAnalyticsClassId(e.target.value)}
              >
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.level} — {c.stream}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!termId ? (
            <EmptyState
              icon={CalendarDays}
              title="No current term"
              description="Set the current academic term before viewing attendance analytics."
            />
          ) : isPendingOverview && !overview ? (
            <div className="space-y-6">
              <AttendanceAdminKpisSkeleton />
              <AttendanceAdminChartsSkeleton />
            </div>
          ) : isOverviewError ? (
            <div className="alert-error flex flex-col items-center gap-2 rounded-xl p-8 text-center text-sm font-medium shadow-sm">
              <AlertCircle className="h-6 w-6" />
              Couldn&apos;t load attendance analytics. Try again.
            </div>
          ) : overview ? (
            <div className="space-y-6">
              <AttendanceAdminKpis kpis={overview.kpis} />
              <AttendanceAdminCharts data={overview} />
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="flex flex-col flex-wrap gap-4 rounded-xl border border-theme bg-theme-raised/40 p-4 sm:flex-row sm:items-end">
            <div className="flex flex-col gap-1.5 sm:min-w-[170px]">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                Date
              </label>
              <input
                type="date"
                max={todayEAT()}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="ms-input cursor-pointer"
              />
            </div>

            <div className="flex flex-col gap-1.5 sm:min-w-[220px]">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                Class Stream
              </label>
              <select
                className="ms-input w-full cursor-pointer disabled:opacity-50"
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                disabled={classes.length === 0 || isLoadingClasses}
              >
                {isLoadingClasses ? (
                  <option>Loading class list…</option>
                ) : classesError ? (
                  <option value="">Couldn&apos;t load classes</option>
                ) : classes.length === 0 ? (
                  <option value="">No classes configured</option>
                ) : (
                  classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.level} — {c.stream}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="flex flex-1 flex-col gap-1.5 sm:min-w-[260px]">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                Search Student
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-faint" />
                <input
                  type="text"
                  placeholder="Search by name or learner ID…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="ms-input w-full pl-9"
                />
              </div>
            </div>
          </div>

          {classesError && (
            <div className="alert-error flex items-center gap-2.5 rounded-xl px-5 py-3 text-sm font-medium shadow-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Couldn&apos;t load the list of class streams. Refresh to try again.
            </div>
          )}

          {data && !isPending && (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
              <StatCard
                label="Presence Rate"
                value={`${stats.rate}%`}
                valueClassName={
                  stats.rate >= 90 ? 'text-theme-success' : 'text-theme-warning'
                }
              />
              <StatCard label="Total Students" value={stats.total} />
              <StatCard
                label="Present"
                value={stats.present}
                valueClassName="text-theme-success"
              />
              <StatCard
                label="Late"
                value={stats.late}
                valueClassName="text-theme-warning"
              />
              <StatCard
                label="Absent"
                value={stats.absent}
                valueClassName="text-theme-danger"
              />
            </div>
          )}

          {classes.length === 0 && !isLoadingClasses && !classesError ? (
            <EmptyState
              icon={Inbox}
              title="No Class Streams Configured"
              description="Set up class streams under School Setup before attendance can be reviewed here."
            />
          ) : isPending ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-theme bg-theme-surface p-14 shadow-sm">
              <Loader2 className="h-7 w-7 animate-spin text-theme-accent" />
              <p className="text-sm text-theme-muted">Loading attendance records…</p>
            </div>
          ) : isError ? (
            <div className="alert-error flex flex-col items-center gap-2 rounded-xl p-8 text-center text-sm font-medium shadow-sm">
              <AlertCircle className="h-6 w-6" />
              Couldn&apos;t load attendance for this class. Check your connection and try again.
            </div>
          ) : !data?.alreadySubmitted ? (
            <EmptyState
              icon={CalendarDays}
              title="Attendance Not Yet Submitted"
              description={`No teacher has submitted attendance for ${selectedClass ? `${selectedClass.level} ${selectedClass.stream}` : 'this class'} on ${new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`}
            />
          ) : filteredTotal === 0 ? (
            <EmptyState
              icon={Search}
              title="No Matching Students"
              description="Try a different name or learner ID."
            />
          ) : (
            <>
              <div className="rounded-xl border border-theme bg-theme-raised/40 px-4 py-3.5">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-semibold text-theme-primary">
                    Attendance breakdown
                  </span>
                  <span className="text-theme-muted">
                    {stats.present + stats.late} of {stats.total} attended
                  </span>
                </div>
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-theme-raised">
                  {stats.total > 0 && (
                    <>
                      <div
                        className={ATTENDANCE_STATUS_STYLE.present.bar}
                        style={{ width: `${(stats.present / stats.total) * 100}%` }}
                      />
                      <div
                        className={ATTENDANCE_STATUS_STYLE.late.bar}
                        style={{ width: `${(stats.late / stats.total) * 100}%` }}
                      />
                      <div
                        className={ATTENDANCE_STATUS_STYLE.absent.bar}
                        style={{ width: `${(stats.absent / stats.total) * 100}%` }}
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="hidden overflow-hidden rounded-xl border border-theme bg-theme-surface md:block">
                <div className="max-h-[65vh] overflow-x-auto overflow-y-auto">
                  <table className="ms-table w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-table-header text-left text-xs font-semibold uppercase tracking-wider text-theme-muted">
                      <tr>
                        <th className="w-16 px-5 py-3.5">#</th>
                        <th className="px-5 py-3.5">Student</th>
                        <th className="w-40 px-5 py-3.5">Learner ID</th>
                        <th className="w-40 px-5 py-3.5">Status</th>
                        <th className="px-5 py-3.5">Teacher Comments</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedStudents.map((student, idx) => (
                        <tr key={student.studentId} className="border-t border-theme">
                          <td className="px-5 py-4 font-medium text-theme-muted">
                            {(page - 1) * pageSize + idx + 1}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-theme-accent-muted text-[11px] font-bold text-theme-accent">
                                {studentInitials(student.studentName)}
                              </span>
                              <span className="font-semibold text-theme-primary">
                                {student.studentName}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-4 font-mono text-xs text-theme-muted">
                            {student.learnerId}
                          </td>
                          <td className="px-5 py-4">
                            <AttendanceStatusBadge status={student.status} />
                          </td>
                          <td className="px-5 py-4 text-xs italic text-theme-muted">
                            {student.notes || (
                              <span className="text-theme-faint not-italic">No remarks</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-2.5 md:hidden">
                {pagedStudents.map((student, idx) => (
                  <div
                    key={student.studentId}
                    className="rounded-xl border border-theme bg-theme-surface p-4"
                  >
                    <div className="mb-2 flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-theme-accent-muted text-xs font-bold text-theme-accent">
                        {studentInitials(student.studentName)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-theme-primary">
                          {(page - 1) * pageSize + idx + 1}. {student.studentName}
                        </p>
                        <p className="font-mono text-[11px] text-theme-muted">
                          {student.learnerId}
                        </p>
                      </div>
                      <AttendanceStatusBadge
                        status={student.status}
                        className="shrink-0"
                      />
                    </div>
                    {student.notes && (
                      <p className="pl-12 text-xs italic text-theme-muted">
                        {student.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <TablePagination
                page={page}
                pageSize={pageSize}
                total={filteredTotal}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                noun="students"
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  valueClassName = 'text-theme-primary',
}: {
  label: string;
  value: string | number;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-theme bg-theme-surface p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${valueClassName}`}>
        {value}
      </div>
    </div>
  );
}
