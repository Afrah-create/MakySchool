'use client';

import { useEffect, useMemo } from 'react';
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import type {
  TeacherAttendanceSchoolLocation,
  TeacherMapPin,
} from '@makyschool/shared';
import 'leaflet/dist/leaflet.css';

// Fix default marker assets for Next.js bundling.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  iconUrl: '/leaflet/marker-icon.png',
  shadowUrl: '/leaflet/marker-shadow.png',
});

function cssVar(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

function createTeacherIcon(status: string, initials: string) {
  const colors: Record<string, string> = {
    present: cssVar('--color-success-text', '#065F46'),
    late: cssVar('--color-warning-text', '#92400E'),
    outside_fence: cssVar('--color-warning-text', '#9A3412'),
    absent: cssVar('--color-danger-text', '#991B1B'),
  };
  const bg = colors[status] || cssVar('--color-text-muted', '#6B7280');
  const border = cssVar('--color-surface', '#ffffff');

  return L.divIcon({
    className: '',
    html: `
      <div style="
        background: ${bg};
        color: ${border};
        width: 36px;
        height: 36px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 2px solid ${border};
        box-shadow: 0 2px 6px color-mix(in srgb, black 25%, transparent);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <span style="transform: rotate(45deg); font-size: 11px; font-weight: 700;">
          ${initials}
        </span>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });
}

function MapControls({
  school,
  pins,
}: {
  school: TeacherAttendanceSchoolLocation | null | undefined;
  pins: TeacherMapPin[];
}) {
  const map = useMap();

  useEffect(() => {
    (window as unknown as { __taCentreSchool?: () => void }).__taCentreSchool = () => {
      if (school?.latitude != null && school?.longitude != null) {
        map.setView([school.latitude, school.longitude], 17);
      }
    };
    (window as unknown as { __taFitPins?: () => void }).__taFitPins = () => {
      const points: L.LatLngExpression[] = pins.map((p) => [p.latitude, p.longitude]);
      if (school?.latitude != null && school?.longitude != null) {
        points.push([school.latitude, school.longitude]);
      }
      if (points.length === 0) return;
      if (points.length === 1) {
        map.setView(points[0], 16);
        return;
      }
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
    };
    return () => {
      delete (window as unknown as { __taCentreSchool?: unknown }).__taCentreSchool;
      delete (window as unknown as { __taFitPins?: unknown }).__taFitPins;
    };
  }, [map, school, pins]);

  return null;
}

export function TeacherAttendanceMap({
  school,
  pins,
  className,
}: {
  school: (TeacherAttendanceSchoolLocation & { name?: string | null }) | null | undefined;
  pins: TeacherMapPin[];
  className?: string;
}) {
  const centre = useMemo((): [number, number] => {
    if (school?.latitude != null && school?.longitude != null) {
      return [school.latitude, school.longitude];
    }
    if (pins[0]) return [pins[0].latitude, pins[0].longitude];
    return [1.3733, 32.2903];
  }, [school, pins]);

  const accent = cssVar('--color-accent', '#4F6EF7');
  const zoom = school?.is_configured ? 16 : 7;

  return (
    <div className={className ?? 'h-80 w-full overflow-hidden rounded-xl border border-theme'}>
      <MapContainer
        center={centre}
        zoom={zoom}
        className="h-full w-full"
        scrollWheelZoom
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <MapControls school={school} pins={pins} />
        {school?.is_configured &&
        school.latitude != null &&
        school.longitude != null ? (
          <>
            <Marker position={[school.latitude, school.longitude]}>
              <Popup>
                <strong>{school.name || 'School'}</strong>
                <br />
                School location
              </Popup>
            </Marker>
            <Circle
              center={[school.latitude, school.longitude]}
              radius={school.radius_metres}
              pathOptions={{
                color: accent,
                fillColor: accent,
                fillOpacity: 0.08,
                weight: 2,
              }}
            />
          </>
        ) : null}
        {pins.map((pin) => (
          <Marker
            key={pin.teacher_id}
            position={[pin.latitude, pin.longitude]}
            icon={createTeacherIcon(pin.status, pin.initials)}
          >
            <Popup>
              <strong>{pin.full_name}</strong>
              <br />
              Status: {pin.status.replace('_', ' ')}
              <br />
              Clocked in: {pin.clock_in_at ?? '—'}
              <br />
              Distance:{' '}
              {pin.distance_metres != null
                ? `${Math.round(pin.distance_metres)}m`
                : '—'}
              <br />
              Clock out: {pin.clock_out_at ?? '—'}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

export function centreMapOnSchool() {
  (window as unknown as { __taCentreSchool?: () => void }).__taCentreSchool?.();
}

export function fitMapToPins() {
  (window as unknown as { __taFitPins?: () => void }).__taFitPins?.();
}
