'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import {
  Circle,
  InfoWindow,
  Map,
  Marker,
  useApiIsLoaded,
  useMap,
} from '@vis.gl/react-google-maps';
import type {
  TeacherAttendanceSchoolLocation,
  TeacherMapPin,
} from '@makyschool/shared';
import {
  GoogleMapsProvider,
  UGANDA_CENTRE,
  cssAccent,
  cssVar,
} from '@/components/maps/GoogleMapsProvider';

export type TeacherAttendanceMapHandle = {
  centreOnSchool: () => void;
  fitPins: () => void;
};

function MapCameraController({
  school,
  pins,
  mapRef,
}: {
  school: TeacherAttendanceSchoolLocation | null | undefined;
  pins: TeacherMapPin[];
  mapRef: React.MutableRefObject<TeacherAttendanceMapHandle | null>;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const handle: TeacherAttendanceMapHandle = {
      centreOnSchool() {
        if (school?.latitude != null && school?.longitude != null) {
          map.setCenter({ lat: school.latitude, lng: school.longitude });
          map.setZoom(17);
        }
      },
      fitPins() {
        const points: google.maps.LatLngLiteral[] = pins.map((p) => ({
          lat: p.latitude,
          lng: p.longitude,
        }));
        if (school?.latitude != null && school?.longitude != null) {
          points.push({ lat: school.latitude, lng: school.longitude });
        }
        if (points.length === 0) return;
        if (points.length === 1) {
          map.setCenter(points[0]!);
          map.setZoom(16);
          return;
        }
        const bounds = new google.maps.LatLngBounds();
        for (const p of points) bounds.extend(p);
        map.fitBounds(bounds, 40);
      },
    };
    mapRef.current = handle;
    return () => {
      mapRef.current = null;
    };
  }, [map, school, pins, mapRef]);

  return null;
}

function statusColor(status: string) {
  const colors: Record<string, string> = {
    present: cssVar('--color-success-text', '#065F46'),
    late: cssVar('--color-warning-text', '#92400E'),
    outside_fence: cssVar('--color-warning-text', '#9A3412'),
    absent: cssVar('--color-danger-text', '#991B1B'),
  };
  return colors[status] || cssVar('--color-text-muted', '#6B7280');
}

function AttendanceMapInner({
  school,
  pins,
  mapRef,
}: {
  school: (TeacherAttendanceSchoolLocation & { name?: string | null }) | null | undefined;
  pins: TeacherMapPin[];
  mapRef: React.MutableRefObject<TeacherAttendanceMapHandle | null>;
}) {
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const [schoolOpen, setSchoolOpen] = useState(false);
  const accent = cssAccent();
  const apiReady = useApiIsLoaded();

  const centre = useMemo(() => {
    if (school?.latitude != null && school?.longitude != null) {
      return { lat: school.latitude, lng: school.longitude };
    }
    if (pins[0]) return { lat: pins[0].latitude, lng: pins[0].longitude };
    return UGANDA_CENTRE;
  }, [school, pins]);

  const zoom = school?.is_configured ? 16 : 7;
  const activePin = pins.find((p) => p.teacher_id === activePinId) ?? null;

  return (
    <Map
      defaultCenter={centre}
      defaultZoom={zoom}
      gestureHandling="greedy"
      mapTypeControl={false}
      streetViewControl={false}
      fullscreenControl={true}
      zoomControl={true}
      className="h-full w-full"
    >
      <MapCameraController school={school} pins={pins} mapRef={mapRef} />
      {school?.is_configured &&
      school.latitude != null &&
      school.longitude != null ? (
        <>
          <Marker
            position={{ lat: school.latitude, lng: school.longitude }}
            title={school.name || 'School'}
            onClick={() => setSchoolOpen(true)}
          />
          {schoolOpen ? (
            <InfoWindow
              position={{ lat: school.latitude, lng: school.longitude }}
              onCloseClick={() => setSchoolOpen(false)}
            >
              <div className="text-sm text-neutral-900">
                <p className="font-semibold">{school.name || 'School'}</p>
                <p>School location</p>
              </div>
            </InfoWindow>
          ) : null}
          <Circle
            center={{ lat: school.latitude, lng: school.longitude }}
            radius={school.radius_metres}
            strokeColor={accent}
            strokeOpacity={0.9}
            strokeWeight={2}
            fillColor={accent}
            fillOpacity={0.08}
          />
        </>
      ) : null}
      {pins.map((pin) => (
        <Marker
          key={pin.teacher_id}
          position={{ lat: pin.latitude, lng: pin.longitude }}
          title={`${pin.full_name} (${pin.status.replace('_', ' ')})`}
          onClick={() => setActivePinId(pin.teacher_id)}
          label={
            apiReady
              ? {
                  text: pin.initials.slice(0, 2).toUpperCase(),
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: '700',
                }
              : undefined
          }
          icon={
            apiReady
              ? {
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 14,
                  fillColor: statusColor(pin.status),
                  fillOpacity: 1,
                  strokeColor: cssVar('--color-surface', '#ffffff'),
                  strokeWeight: 2,
                }
              : undefined
          }
        />
      ))}
      {activePin ? (
        <InfoWindow
          position={{ lat: activePin.latitude, lng: activePin.longitude }}
          onCloseClick={() => setActivePinId(null)}
        >
          <div className="min-w-[10rem] text-sm text-neutral-900">
            <p className="font-semibold">{activePin.full_name}</p>
            <p className="mt-1 capitalize">
              Status: {activePin.status.replace('_', ' ')}
            </p>
            <p>Clocked in: {activePin.clock_in_at ?? '—'}</p>
            <p>
              Distance:{' '}
              {activePin.distance_metres != null
                ? `${Math.round(activePin.distance_metres)}m`
                : '—'}
            </p>
            <p>Clock out: {activePin.clock_out_at ?? '—'}</p>
          </div>
        </InfoWindow>
      ) : null}
    </Map>
  );
}

export const TeacherAttendanceMap = forwardRef<
  TeacherAttendanceMapHandle,
  {
    school:
      | (TeacherAttendanceSchoolLocation & { name?: string | null })
      | null
      | undefined;
    pins: TeacherMapPin[];
    className?: string;
  }
>(function TeacherAttendanceMap({ school, pins, className }, ref) {
  const mapRef = useMemo(
    () => ({ current: null as TeacherAttendanceMapHandle | null }),
    [],
  );

  useImperativeHandle(ref, () => ({
    centreOnSchool() {
      mapRef.current?.centreOnSchool();
    },
    fitPins() {
      mapRef.current?.fitPins();
    },
  }));

  return (
    <div
      className={
        className ??
        'h-full min-h-[20rem] w-full overflow-hidden rounded-2xl border border-theme'
      }
    >
      <GoogleMapsProvider>
        <AttendanceMapInner school={school} pins={pins} mapRef={mapRef} />
      </GoogleMapsProvider>
    </div>
  );
});
