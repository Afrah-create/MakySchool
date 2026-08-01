'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, MapPin, Navigation } from 'lucide-react';
import { DashboardPage } from '@makyschool/ui/components/layout/DashboardPage';
import { EmptyState } from '@makyschool/ui/components/ui/EmptyState';
import { LoadingButton } from '@makyschool/ui/components/ui/LoadingButton';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { useToast } from '@/providers/ToastProvider';
import {
  useTeacherClockIn,
  useTeacherClockOut,
  useTeacherMyStatus,
} from '@/hooks/useTeacherAttendance';

type GpsStatus = 'idle' | 'acquiring' | 'ready' | 'error';

type Coords = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatClock(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(minutes: number | null | undefined) {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function statusLabel(status: string) {
  switch (status) {
    case 'present':
      return 'On time';
    case 'late':
      return 'Late';
    case 'outside_fence':
      return 'Outside fence';
    case 'partial':
      return 'Partial';
    default:
      return status;
  }
}

export function AttendanceClock() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useTeacherMyStatus();
  const clockIn = useTeacherClockIn();
  const clockOut = useTeacherClockOut();

  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('idle');
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);

  const acquireGps = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError('Your browser does not support location services.');
      setGpsStatus('error');
      return;
    }
    setGpsStatus('acquiring');
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setGpsStatus('ready');
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setGpsError(
            'Location access denied. Please enable location in browser settings.',
          );
        } else if (error.code === error.TIMEOUT) {
          setGpsError('Location timed out. Please try again.');
        } else {
          setGpsError('Could not get your location. Please try again.');
        }
        setGpsStatus('error');
      },
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 30_000,
      },
    );
  }, []);

  useEffect(() => {
    acquireGps();
  }, [acquireGps]);

  const school = data?.school_location;
  const today = data?.today;
  const distance = useMemo(() => {
    if (!coords || !school?.is_configured || school.latitude == null || school.longitude == null) {
      return null;
    }
    return Math.round(
      haversine(coords.latitude, coords.longitude, school.latitude, school.longitude),
    );
  }, [coords, school]);

  const withinFence =
    distance != null && school?.radius_metres != null
      ? distance <= school.radius_metres
      : null;

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  async function handleClockIn() {
    if (!coords) return;
    try {
      const res = await clockIn.mutateAsync({
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy_metres: coords.accuracy,
      });
      toast.success(res.message);
    } catch (err) {
      const e = err as Error & {
        code?: string;
        distance_metres?: number;
        allowed_metres?: number;
      };
      if (e.code === 'OUTSIDE_GEOFENCE') {
        toast.error(
          `You are ${e.distance_metres ?? '?'}m from school. Must be within ${e.allowed_metres ?? '?'}m.`,
        );
      } else {
        toast.error(e.message || 'Clock-in failed.');
      }
    }
  }

  async function handleClockOut() {
    if (!coords) {
      acquireGps();
      toast.error('Getting your location… try again in a moment.');
      return;
    }
    try {
      const res = await clockOut.mutateAsync({
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy_metres: coords.accuracy,
      });
      toast.success(res.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Clock-out failed.');
    }
  }

  const liveDuration = useMemo(() => {
    if (!today?.clock_in_at || today.is_clocked_out) {
      return today?.duration_minutes ?? null;
    }
    const start = new Date(today.clock_in_at).getTime();
    return Math.max(0, Math.floor((Date.now() - start) / 60_000));
  }, [today]);

  if (isLoading) {
    return (
      <DashboardPage embedded maxWidth="lg" title="My attendance">
        <Skeleton className="h-80 w-full rounded-2xl" />
      </DashboardPage>
    );
  }

  if (isError) {
    return (
      <DashboardPage embedded maxWidth="lg" title="My attendance">
        <EmptyState
          variant="error"
          title="Couldn’t load attendance"
          description="Check your connection and try again."
          onRetry={() => void refetch()}
        />
      </DashboardPage>
    );
  }

  return (
    <DashboardPage
      embedded
      maxWidth="lg"
      eyebrow="Teacher"
      title="My attendance"
      description="Clock in and out with GPS verification."
    >
      <div className="space-y-5">
        <section className="overflow-hidden rounded-2xl border border-theme bg-theme-surface p-5 sm:p-6">
          <p className="text-lg font-semibold text-theme-primary">{greeting}</p>
          <p className="mt-1 text-sm text-theme-muted">{dateLabel}</p>

          {gpsStatus === 'error' ? (
            <div className="mt-6 rounded-xl border border-theme bg-theme-raised/40 p-4">
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-theme-danger" />
                <div>
                  <p className="font-medium text-theme-primary">Location access needed</p>
                  <p className="mt-1 text-sm text-theme-muted">{gpsError}</p>
                  <p className="mt-2 text-sm text-theme-muted">
                    Enable location for this site in your browser settings, then try again.
                  </p>
                  <LoadingButton
                    className="mt-4"
                    variant="ghost"
                    onClick={() => acquireGps()}
                  >
                    <Navigation className="h-4 w-4" />
                    Retry location
                  </LoadingButton>
                </div>
              </div>
            </div>
          ) : null}

          {!today?.is_clocked_in ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-theme bg-theme-raised/40 px-4 py-3 text-sm">
                {gpsStatus === 'acquiring' ? (
                  <p className="flex items-center gap-2 text-theme-muted">
                    <MapPin className="h-4 w-4 animate-pulse" />
                    Getting your location…
                  </p>
                ) : gpsStatus === 'ready' && distance != null ? (
                  <p
                    className={
                      withinFence
                        ? 'text-theme-success'
                        : 'text-theme-danger'
                    }
                  >
                    <MapPin className="mr-1 inline h-4 w-4" />
                    You are {distance} metres from school
                    {withinFence === false ? ' — too far' : ''}
                  </p>
                ) : gpsStatus === 'ready' ? (
                  <p className="text-theme-muted">
                    <MapPin className="mr-1 inline h-4 w-4" />
                    Location ready
                    {!school?.is_configured
                      ? ' (school location not configured — geofence off)'
                      : ''}
                  </p>
                ) : null}
              </div>

              <LoadingButton
                variant="primary"
                className="h-16 w-full text-base font-semibold"
                loading={clockIn.isPending || gpsStatus === 'acquiring'}
                disabled={gpsStatus !== 'ready' || !coords}
                onClick={() => void handleClockIn()}
              >
                <Clock className="h-5 w-5" />
                Clock in
              </LoadingButton>
              <p className="text-center text-xs text-theme-muted">
                School opens at {data?.settings.clock_in_deadline ?? '08:00'}
              </p>
            </div>
          ) : today.is_clocked_out ? (
            <div className="mt-6 space-y-3 text-center">
              <p className="text-lg font-semibold text-theme-success">Day complete</p>
              <dl className="mx-auto grid max-w-xs gap-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-theme-muted">Clock in</dt>
                  <dd className="font-medium tabular-nums text-theme-primary">
                    {formatClock(today.clock_in_at)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-theme-muted">Clock out</dt>
                  <dd className="font-medium tabular-nums text-theme-primary">
                    {formatClock(today.clock_out_at)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-theme-muted">Duration</dt>
                  <dd className="font-medium tabular-nums text-theme-primary">
                    {formatDuration(today.duration_minutes)}
                  </dd>
                </div>
              </dl>
              <p className="pt-2 text-sm text-theme-muted">See you tomorrow!</p>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-theme bg-theme-success-bg px-4 py-4 text-center">
                <p className="text-lg font-semibold text-theme-success">Clocked in</p>
                <p className="mt-1 text-sm text-theme-muted">
                  {formatClock(today.clock_in_at)} · {statusLabel(today.status)}
                </p>
                <p className="mt-3 text-sm text-theme-primary">
                  Duration: {formatDuration(liveDuration)}
                </p>
                {today.clock_in_distance_metres != null ? (
                  <p className="mt-1 text-xs text-theme-muted">
                    <MapPin className="mr-1 inline h-3.5 w-3.5" />
                    {Math.round(today.clock_in_distance_metres)}m from school
                  </p>
                ) : null}
              </div>
              <LoadingButton
                className="h-14 w-full border border-[color:var(--color-danger-dot)] bg-theme-danger-bg font-semibold text-theme-danger"
                loading={clockOut.isPending}
                onClick={() => void handleClockOut()}
              >
                Clock out
              </LoadingButton>
            </div>
          )}
        </section>

        {(data?.recent?.length ?? 0) > 0 ? (
          <section className="overflow-hidden rounded-2xl border border-theme bg-theme-surface">
            <div className="border-b border-theme px-4 py-3">
              <h2 className="text-sm font-semibold text-theme-primary">Recent days</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="ms-table ms-table-compact w-full min-w-[28rem]">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Clock in</th>
                    <th>Clock out</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.recent.map((row) => (
                    <tr key={row.date}>
                      <td className="whitespace-nowrap text-theme-primary">
                        {new Date(row.date + 'T12:00:00').toLocaleDateString(undefined, {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        })}
                      </td>
                      <td className="capitalize text-theme-muted">{row.status.replace('_', ' ')}</td>
                      <td className="tabular-nums">{formatClock(row.clock_in_at)}</td>
                      <td className="tabular-nums">{formatClock(row.clock_out_at)}</td>
                      <td className="tabular-nums">{formatDuration(row.duration_minutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {data?.this_month ? (
          <section className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-theme bg-theme-surface px-3 py-3 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                Present
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-theme-primary">
                {data.this_month.present}
              </p>
            </div>
            <div className="rounded-xl border border-theme bg-theme-surface px-3 py-3 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                Late
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-theme-primary">
                {data.this_month.late}
              </p>
            </div>
            <div className="rounded-xl border border-theme bg-theme-surface px-3 py-3 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                Rate
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-theme-primary">
                {data.this_month.attendance_percent}%
              </p>
            </div>
          </section>
        ) : null}
      </div>
    </DashboardPage>
  );
}
