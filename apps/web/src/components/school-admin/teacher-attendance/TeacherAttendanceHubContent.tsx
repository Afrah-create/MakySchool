'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { Download, MapPin, Search } from 'lucide-react';
import type { TeacherAttendanceStatus, TeacherTodayRow } from '@makyschool/shared';
import { PageHeader } from '@makyschool/ui/components/ui/PageHeader';
import { EmptyState } from '@makyschool/ui/components/ui/EmptyState';
import { LoadingButton } from '@makyschool/ui/components/ui/LoadingButton';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { CanDo } from '@/components/ui/CanDo';
import type { TeacherAttendanceMapHandle } from '@/components/school-admin/teacher-attendance/TeacherAttendanceMap';
import { ManualMarkDialog } from '@/components/school-admin/teacher-attendance/ManualMarkDialog';
import {
  useTeacherAttendanceMap,
  useTeacherAttendanceToday,
} from '@/hooks/useTeacherAttendance';

const TeacherAttendanceMap = dynamic(
  () =>
    import('@/components/school-admin/teacher-attendance/TeacherAttendanceMap').then(
      (m) => m.TeacherAttendanceMap,
    ),
  {
    ssr: false,
    loading: () => <Skeleton className="h-80 w-full rounded-xl" />,
  },
);

type StatusFilter = 'all' | TeacherAttendanceStatus;

function formatClock(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function statusDot(status: string) {
  switch (status) {
    case 'present':
      return 'bg-[var(--color-success-dot)]';
    case 'late':
    case 'outside_fence':
      return 'bg-[var(--color-warning-dot)]';
    case 'absent':
      return 'bg-[var(--color-danger-dot)]';
    default:
      return 'bg-[var(--color-text-muted)]';
  }
}

function statusLabel(row: TeacherTodayRow) {
  if (row.status === 'late' && row.clock_in_at) {
    return 'Late';
  }
  return row.status.replace(/_/g, ' ');
}

function rateColor(rate: number) {
  if (rate > 85) return 'text-theme-success';
  if (rate >= 70) return 'text-theme-warning';
  return 'text-theme-danger';
}

function exportCsv(rows: TeacherTodayRow[], date: string) {
  const header = [
    'Name',
    'Email',
    'Status',
    'Clock In',
    'Clock Out',
    'Distance (m)',
    'Duration (min)',
    'Manual',
  ];
  const lines = rows.map((r) =>
    [
      r.full_name,
      r.email ?? '',
      r.status,
      r.clock_in_at ?? '',
      r.clock_out_at ?? '',
      r.clock_in_distance_metres ?? '',
      r.duration_minutes ?? '',
      r.is_manual ? 'yes' : '',
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  );
  const blob = new Blob([[header.join(','), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `teacher-attendance-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-theme bg-theme-surface px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone ?? 'text-theme-primary'}`}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-theme-muted">{hint}</p> : null}
    </div>
  );
}

export function TeacherAttendanceHubContent() {
  const mapRef = useRef<TeacherAttendanceMapHandle>(null);
  const { data, isLoading, isError, refetch } = useTeacherAttendanceToday();
  const mapQuery = useTeacherAttendanceMap();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [mobileTab, setMobileTab] = useState<'list' | 'map'>('list');
  const [manual, setManual] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const teachers = data?.teachers ?? [];
  const summary = data?.summary;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return teachers.filter((t) => {
      if (filter !== 'all' && t.status !== filter) return false;
      if (q && !t.full_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [teachers, filter, search]);

  const dateLabel = data?.date
    ? new Date(data.date + 'T12:00:00').toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';

  const updatedLabel = mapQuery.data?.updated_at
    ? new Date(mapQuery.data.updated_at).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <EmptyState
          variant="error"
          title="Couldn’t load attendance"
          description="Check your connection and try again."
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const filters: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'present', label: 'Present' },
    { id: 'late', label: 'Late' },
    { id: 'absent', label: 'Absent' },
    { id: 'outside_fence', label: 'Outside fence' },
    { id: 'not_yet_arrived', label: 'Not yet' },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <PageHeader
        title="Teacher attendance"
        description="Daily attendance tracking with GPS verification"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/teacher-attendance/history" className="ms-btn-ghost">
              History
            </Link>
            <Link
              href="/dashboard/settings/teacher-attendance"
              className="ms-btn-ghost"
            >
              Settings
            </Link>
            <LoadingButton
              variant="ghost"
              onClick={() => exportCsv(filtered, data.date)}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </LoadingButton>
          </div>
        }
      />

      <p className="text-2xl font-semibold text-theme-primary">{dateLabel}</p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="Present"
          value={summary?.present ?? 0}
          hint={`${summary?.attendance_rate ?? 0}% arrived`}
          tone="text-theme-success"
        />
        <StatCard label="Late" value={summary?.late ?? 0} tone="text-theme-warning" />
        <StatCard label="Absent" value={summary?.absent ?? 0} tone="text-theme-danger" />
        <StatCard label="Not yet arrived" value={summary?.not_yet_arrived ?? 0} />
        <StatCard
          label="Attendance rate"
          value={`${summary?.attendance_rate ?? 0}%`}
          tone={rateColor(summary?.attendance_rate ?? 0)}
        />
      </div>

      <div className="flex gap-2 lg:hidden">
        <button
          type="button"
          className={`ms-btn-ghost flex-1 ${mobileTab === 'list' ? '!bg-theme-accent-muted text-theme-accent' : ''}`}
          onClick={() => setMobileTab('list')}
        >
          List
        </button>
        <button
          type="button"
          className={`ms-btn-ghost flex-1 ${mobileTab === 'map' ? '!bg-theme-accent-muted text-theme-accent' : ''}`}
          onClick={() => setMobileTab('map')}
        >
          Map
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section
          className={`overflow-hidden rounded-xl border border-theme bg-theme-surface ${
            mobileTab === 'map' ? 'hidden lg:block' : ''
          }`}
        >
          <div className="flex flex-col gap-3 border-b border-theme p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {filters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={[
                    'rounded-full px-2.5 py-1 text-xs font-medium',
                    filter === f.id
                      ? 'bg-theme-accent-muted text-theme-accent'
                      : 'bg-theme-raised text-theme-muted',
                  ].join(' ')}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <label className="relative block sm:w-52">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-theme-muted" />
              <input
                className="ms-input w-full !pl-8"
                placeholder="Search teachers"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title="No teachers match"
              description="Try another filter or search."
            />
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {filtered.map((t) => (
                <li key={t.teacher_id} className="px-4 py-3 hover:bg-theme-raised/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/dashboard/teacher-attendance/${t.teacher_id}`}
                          className="truncate font-medium text-theme-primary hover:underline"
                        >
                          {t.full_name}
                        </Link>
                        <span className="inline-flex items-center gap-1.5 text-xs capitalize text-theme-muted">
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${statusDot(t.status)}`}
                          />
                          {statusLabel(t)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-theme-muted">
                        {t.clock_in_distance_metres != null ? (
                          <>
                            <MapPin className="mr-1 inline h-3 w-3" />
                            {Math.round(t.clock_in_distance_metres)}m from school
                          </>
                        ) : (
                          'No GPS yet'
                        )}
                        {t.is_manual ? ' · Manual' : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-xs tabular-nums text-theme-muted">
                      <p>{formatClock(t.clock_in_at)}</p>
                      <p className="mt-0.5">Out: {formatClock(t.clock_out_at)}</p>
                      <CanDo action="manualMarkAttendance">
                        <button
                          type="button"
                          className="mt-1 text-theme-accent hover:underline"
                          onClick={() =>
                            setManual({ id: t.teacher_id, name: t.full_name })
                          }
                        >
                          Manual mark
                        </button>
                      </CanDo>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className={`space-y-3 ${mobileTab === 'list' ? 'hidden lg:block' : ''}`}
        >
          <div className="flex flex-wrap gap-2">
            <LoadingButton
              variant="ghost"
              className="!px-3 !py-1.5 text-xs"
              onClick={() => mapRef.current?.centreOnSchool()}
            >
              Centre on school
            </LoadingButton>
            <LoadingButton
              variant="ghost"
              className="!px-3 !py-1.5 text-xs"
              onClick={() => mapRef.current?.fitPins()}
            >
              Fit all pins
            </LoadingButton>
          </div>
          <TeacherAttendanceMap
            ref={mapRef}
            school={mapQuery.data?.school_location}
            pins={mapQuery.data?.pins ?? []}
            className="h-[28rem] w-full overflow-hidden rounded-xl border border-theme"
          />
          <p className="text-xs text-theme-muted">
            Last updated: {updatedLabel ?? '—'} · Auto-refreshes every minute
          </p>
          {(mapQuery.data?.absent_teachers.length ?? 0) > 0 ? (
            <p className="text-xs text-theme-muted">
              {mapQuery.data!.absent_teachers.length} teachers not yet arrived:{' '}
              {mapQuery.data!.absent_teachers
                .slice(0, 5)
                .map((t) => t.full_name)
                .join(', ')}
              {mapQuery.data!.absent_teachers.length > 5 ? '…' : ''}
            </p>
          ) : null}
        </section>
      </div>

      {manual ? (
        <ManualMarkDialog
          open={!!manual}
          onClose={() => setManual(null)}
          teacherId={manual.id}
          teacherName={manual.name}
          defaultDate={data.date}
        />
      ) : null}
    </div>
  );
}
