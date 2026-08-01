'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { MapPin, Navigation, Save } from 'lucide-react';
import { SettingsPanel } from '@/components/school-admin/settings/SettingsPanel';
import { LoadingButton } from '@makyschool/ui/components/ui/LoadingButton';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { useToast } from '@/providers/ToastProvider';
import {
  useTeacherAttendanceSettings,
  useUpdateTeacherAttendanceSettings,
} from '@/hooks/useTeacherAttendance';

const SettingsLocationMap = dynamic(
  () =>
    import('@/components/school-admin/teacher-attendance/SettingsLocationMap').then(
      (m) => m.SettingsLocationMap,
    ),
  { ssr: false, loading: () => <Skeleton className="h-56 w-full rounded-xl" /> },
);

function AttendanceSettingsForm() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useTeacherAttendanceSettings();
  const update = useUpdateTeacherAttendanceSettings();

  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radius, setRadius] = useState('200');
  const [deadline, setDeadline] = useState('08:00');
  const [autoAbsent, setAutoAbsent] = useState('09:30');
  const [enforce, setEnforce] = useState(true);
  const [allowOutside, setAllowOutside] = useState(false);
  const [notifyLate, setNotifyLate] = useState(false);

  useEffect(() => {
    if (!data) return;
    setLatitude(
      data.school_location.latitude != null
        ? String(data.school_location.latitude)
        : '',
    );
    setLongitude(
      data.school_location.longitude != null
        ? String(data.school_location.longitude)
        : '',
    );
    setRadius(String(data.school_location.radius_metres ?? 200));
    setDeadline(data.settings.clock_in_deadline);
    setAutoAbsent(data.settings.auto_absent_after);
    setEnforce(data.settings.enforce_geofence);
    setAllowOutside(data.settings.allow_outside_fence);
    setNotifyLate(data.settings.notify_admin_on_late);
  }, [data]);

  function useMyLocation() {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(7));
        setLongitude(pos.coords.longitude.toFixed(7));
        toast.success('Location captured from your device.');
      },
      () => toast.error('Could not get your location.'),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  async function save() {
    const lat = latitude.trim() ? Number(latitude) : undefined;
    const lng = longitude.trim() ? Number(longitude) : undefined;
    const rad = Number(radius);
    if ((lat != null && Number.isNaN(lat)) || (lng != null && Number.isNaN(lng))) {
      toast.error('Latitude and longitude must be numbers.');
      return;
    }
    if (Number.isNaN(rad) || rad < 50 || rad > 2000) {
      toast.error('Radius must be between 50 and 2000 metres.');
      return;
    }
    try {
      await update.mutateAsync({
        latitude: lat,
        longitude: lng,
        radius_metres: rad,
        clock_in_deadline: deadline,
        auto_absent_after: autoAbsent,
        enforce_geofence: enforce,
        allow_outside_fence: allowOutside,
        notify_admin_on_late: notifyLate,
      });
      toast.success('Attendance settings saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed.');
    }
  }

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (isError) {
    return (
      <p className="text-sm text-theme-danger">
        Could not load settings.{' '}
        <button type="button" className="underline" onClick={() => void refetch()}>
          Retry
        </button>
      </p>
    );
  }

  const mapLat = latitude ? Number(latitude) : null;
  const mapLng = longitude ? Number(longitude) : null;

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-theme-primary">School location</h2>
          <p className="mt-1 text-sm text-theme-muted">
            Set the school gate coordinates used for geofencing.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase text-theme-muted">
              Latitude
            </span>
            <input
              className="ms-input w-full"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="0.3152000"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase text-theme-muted">
              Longitude
            </span>
            <input
              className="ms-input w-full"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="32.5816000"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase text-theme-muted">
              Radius (metres)
            </span>
            <input
              type="number"
              min={50}
              max={2000}
              className="ms-input w-full"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <LoadingButton variant="ghost" onClick={useMyLocation}>
            <Navigation className="h-4 w-4" />
            Use my current location
          </LoadingButton>
        </div>

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs text-theme-muted">
            <MapPin className="h-3.5 w-3.5" />
            Click the map to set the school location
          </p>
          <SettingsLocationMap
            latitude={Number.isFinite(mapLat) ? mapLat : null}
            longitude={Number.isFinite(mapLng) ? mapLng : null}
            radiusMetres={Number(radius) || 200}
            onPick={(lat, lng) => {
              setLatitude(lat.toFixed(7));
              setLongitude(lng.toFixed(7));
            }}
          />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-theme-primary">Attendance rules</h2>
          <p className="mt-1 text-sm text-theme-muted">
            Deadlines and geofence behaviour for teacher clock-in.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase text-theme-muted">
              Clock-in deadline
            </span>
            <input
              type="time"
              className="ms-input w-full"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase text-theme-muted">
              Auto-absent after
            </span>
            <input
              type="time"
              className="ms-input w-full"
              value={autoAbsent}
              onChange={(e) => setAutoAbsent(e.target.value)}
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-theme-primary">
          <input
            type="checkbox"
            checked={enforce}
            onChange={(e) => setEnforce(e.target.checked)}
          />
          Enforce geofence (reject clock-in outside radius)
        </label>

        {enforce ? (
          <label className="flex items-center gap-2 text-sm text-theme-primary">
            <input
              type="checkbox"
              checked={allowOutside}
              onChange={(e) => setAllowOutside(e.target.checked)}
            />
            Allow check-in but mark as &quot;Outside fence&quot;
          </label>
        ) : null}

        <label className="flex items-center gap-2 text-sm text-theme-primary">
          <input
            type="checkbox"
            checked={notifyLate}
            onChange={(e) => setNotifyLate(e.target.checked)}
          />
          Notify admin when a teacher is late
        </label>
      </section>

      <LoadingButton
        variant="primary"
        loading={update.isPending}
        onClick={() => void save()}
      >
        <Save className="h-4 w-4" />
        Save attendance settings
      </LoadingButton>
    </div>
  );
}

export function TeacherAttendanceSettingsContent() {
  return (
    <SettingsPanel
      eyebrow="Settings"
      title="Teacher attendance"
      description="School location, geofence radius, and clock-in rules."
    >
      {() => <AttendanceSettingsForm />}
    </SettingsPanel>
  );
}
