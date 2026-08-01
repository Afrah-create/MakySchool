'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { PageHeader } from '@makyschool/ui/components/ui/PageHeader';
import { EmptyState } from '@makyschool/ui/components/ui/EmptyState';
import { LoadingButton } from '@makyschool/ui/components/ui/LoadingButton';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { useTeacherAttendanceHistory } from '@/hooks/useTeacherAttendance';

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

export function TeacherAttendanceHistoryContent() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(monthAgo);
  const [dateTo, setDateTo] = useState(today);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const filters = useMemo(
    () => ({ dateFrom, dateTo, status: status || undefined, page, limit: 30 }),
    [dateFrom, dateTo, status, page],
  );

  const { data, isLoading, isError, refetch } = useTeacherAttendanceHistory(filters);

  function exportCsv() {
    const rows = data?.records ?? [];
    const header = [
      'Date',
      'Teacher',
      'Clock In',
      'Clock Out',
      'Duration',
      'Distance',
      'Status',
      'Manual',
      'Reason',
    ];
    const lines = rows.map((r) =>
      [
        r.date,
        r.full_name,
        r.clock_in_at ?? '',
        r.clock_out_at ?? '',
        r.duration_minutes ?? '',
        r.clock_in_distance_metres ?? '',
        r.status,
        r.is_manual ? 'yes' : '',
        r.manual_reason ?? '',
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
    a.download = `teacher-attendance-history.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <PageHeader
        title="Attendance history"
        description="Filter and export teacher GPS attendance records."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/teacher-attendance" className="ms-btn-ghost">
              Today
            </Link>
            <LoadingButton variant="ghost" onClick={exportCsv}>
              <Download className="h-4 w-4" />
              Export CSV
            </LoadingButton>
          </div>
        }
      />

      <div className="flex flex-col gap-3 rounded-xl border border-theme bg-theme-raised/40 p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase text-theme-muted">
            From
          </span>
          <input
            type="date"
            className="ms-input"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase text-theme-muted">
            To
          </span>
          <input
            type="date"
            className="ms-input"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase text-theme-muted">
            Status
          </span>
          <select
            className="ms-input"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            <option value="present">Present</option>
            <option value="late">Late</option>
            <option value="absent">Absent</option>
            <option value="outside_fence">Outside fence</option>
            <option value="partial">Partial</option>
          </select>
        </label>
      </div>

      {isLoading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : isError ? (
        <EmptyState
          variant="error"
          title="Couldn’t load history"
          description="Check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : !data?.records.length ? (
        <EmptyState title="No records" description="Try a wider date range." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-theme bg-theme-surface">
            <table className="ms-table ms-table-compact w-full min-w-[48rem]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Teacher</th>
                  <th>Clock in</th>
                  <th>Clock out</th>
                  <th>Duration</th>
                  <th>Distance</th>
                  <th>Status</th>
                  <th>Manual</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{r.date}</td>
                    <td>
                      <Link
                        href={`/dashboard/teacher-attendance/${r.teacher_id}`}
                        className="font-medium text-theme-accent hover:underline"
                      >
                        {r.full_name}
                      </Link>
                    </td>
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
                    <td className="capitalize">{r.status.replace('_', ' ')}</td>
                    <td>
                      {r.is_manual
                        ? r.manual_reason
                          ? `✓ (${r.manual_reason})`
                          : '✓'
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-sm text-theme-muted">
            <p>
              Page {data.page} · {data.total} records
            </p>
            <div className="flex gap-2">
              <LoadingButton
                variant="ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </LoadingButton>
              <LoadingButton
                variant="ghost"
                disabled={page * data.limit >= data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </LoadingButton>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
