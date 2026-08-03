'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import {
  Download,
  MapPin,
  RefreshCw,
  Search,
  Settings2,
} from 'lucide-react';
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
    loading: () => <Skeleton className="h-full min-h-[20rem] w-full rounded-2xl" />,
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

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-theme bg-theme-surface px-3 py-2.5 sm:px-4">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-theme-muted sm:text-[11px]">
        {label}
      </p>
      <p
        className={`mt-0.5 text-xl font-semibold tabular-nums sm:text-2xl ${tone ?? 'text-theme-primary'}`}
      >
        {value}
      </p>
    </div>
  );
}

export function TeacherAttendanceHubContent() {
  const mapRef = useRef<TeacherAttendanceMapHandle>(null);
  const { data, isLoading, isError, refetch } = useTeacherAttendanceToday();
  const mapQuery = useTeacherAttendanceMap();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [mobileTab, setMobileTab] = useState<'map' | 'list'>('map');
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
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-[28rem] w-full rounded-2xl" />
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
    { id: 'outside_fence', label: 'Outside' },
    { id: 'not_yet_arrived', label: 'Not yet' },
  ];

  const pinCount = mapQuery.data?.pins.length ?? 0;
  const absentCount = mapQuery.data?.absent_teachers.length ?? 0;

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:space-y-5 sm:p-6">
      <PageHeader
        title="Teacher attendance"
        description={dateLabel || 'Daily attendance with GPS verification'}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/teacher-attendance/history"
              className="ms-btn-ghost"
            >
              History
            </Link>
            <Link
              href="/dashboard/settings/teacher-attendance"
              className="ms-btn-ghost inline-flex items-center gap-1.5"
            >
              <Settings2 className="h-4 w-4" />
              Settings
            </Link>
            <LoadingButton
              variant="ghost"
              onClick={() => exportCsv(filtered, data.date)}
            >
              <Download className="h-4 w-4" />
              Export
            </LoadingButton>
          </div>
        }
      />

      {/* Compact stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <StatPill
          label="Present"
          value={summary?.present ?? 0}
          tone="text-theme-success"
        />
        <StatPill
          label="Late"
          value={summary?.late ?? 0}
          tone="text-theme-warning"
        />
        <StatPill
          label="Absent"
          value={summary?.absent ?? 0}
          tone="text-theme-danger"
        />
        <StatPill label="Not yet" value={summary?.not_yet_arrived ?? 0} />
        <StatPill
          label="Rate"
          value={`${summary?.attendance_rate ?? 0}%`}
          tone={rateColor(summary?.attendance_rate ?? 0)}
        />
      </div>

      {/* Mobile tabs — map first */}
      <div className="flex rounded-xl border border-theme bg-theme-raised/40 p-1 lg:hidden">
        <button
          type="button"
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
            mobileTab === 'map'
              ? 'bg-theme-surface text-theme-primary shadow-sm'
              : 'text-theme-muted'
          }`}
          onClick={() => setMobileTab('map')}
        >
          Map
        </button>
        <button
          type="button"
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
            mobileTab === 'list'
              ? 'bg-theme-surface text-theme-primary shadow-sm'
              : 'text-theme-muted'
          }`}
          onClick={() => setMobileTab('list')}
        >
          List ({filtered.length})
        </button>
      </div>

      {/* Map-first layout: large map on top / left, list secondary */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.9fr)] xl:gap-5">
        <section
          className={`overflow-hidden rounded-2xl border border-theme bg-theme-surface shadow-theme-card ${
            mobileTab === 'list' ? 'hidden lg:block' : ''
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-theme px-3 py-2.5 sm:px-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-theme-primary">Live map</p>
              <p className="text-xs text-theme-muted">
                {pinCount} pin{pinCount === 1 ? '' : 's'}
                {absentCount > 0 ? ` · ${absentCount} not arrived` : ''}
                {updatedLabel ? ` · Updated ${updatedLabel}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className="ms-btn-ghost !px-2.5 !py-1.5 text-xs"
                onClick={() => mapRef.current?.centreOnSchool()}
              >
                Centre school
              </button>
              <button
                type="button"
                className="ms-btn-ghost !px-2.5 !py-1.5 text-xs"
                onClick={() => mapRef.current?.fitPins()}
              >
                Fit pins
              </button>
              <button
                type="button"
                className="ms-btn-ghost !px-2.5 !py-1.5 text-xs"
                onClick={() => void mapQuery.refetch()}
                title="Refresh map"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="relative h-[min(70vh,36rem)] w-full min-h-[22rem] sm:h-[min(72vh,40rem)] sm:min-h-[28rem]">
            <TeacherAttendanceMap
              ref={mapRef}
              school={mapQuery.data?.school_location}
              pins={mapQuery.data?.pins ?? []}
              className="absolute inset-0 h-full w-full"
            />
          </div>

          {absentCount > 0 ? (
            <div className="border-t border-theme px-3 py-2.5 sm:px-4">
              <p className="text-xs leading-relaxed text-theme-muted">
                <span className="font-medium text-theme-secondary">
                  Not yet arrived:
                </span>{' '}
                {mapQuery
                  .data!.absent_teachers.slice(0, 8)
                  .map((t) => t.full_name)
                  .join(', ')}
                {absentCount > 8 ? ` +${absentCount - 8} more` : ''}
              </p>
            </div>
          ) : null}
        </section>

        <section
          className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border border-theme bg-theme-surface shadow-theme-card ${
            mobileTab === 'map' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="space-y-2.5 border-b border-theme p-3 sm:p-4">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-theme-muted" />
              <input
                className="ms-input w-full !pl-8"
                placeholder="Search teachers"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-1">
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
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-4">
              <EmptyState
                title="No teachers match"
                description="Try another filter or search."
              />
            </div>
          ) : (
            <ul className="max-h-[min(70vh,36rem)] flex-1 divide-y divide-[var(--color-border)] overflow-y-auto sm:max-h-[min(72vh,40rem)]">
              {filtered.map((t) => (
                <li
                  key={t.teacher_id}
                  className="px-3 py-3 hover:bg-theme-raised/30 sm:px-4"
                >
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
                            {Math.round(t.clock_in_distance_metres)}m
                          </>
                        ) : (
                          'No GPS yet'
                        )}
                        {t.is_manual ? ' · Manual' : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-xs tabular-nums text-theme-muted">
                      <p>In {formatClock(t.clock_in_at)}</p>
                      <p className="mt-0.5">Out {formatClock(t.clock_out_at)}</p>
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
