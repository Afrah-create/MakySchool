'use client';

import { useMemo } from 'react';
import { Circle, MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  iconUrl: '/leaflet/marker-icon.png',
  shadowUrl: '/leaflet/marker-shadow.png',
});

function ClickHandler({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function SettingsLocationMap({
  latitude,
  longitude,
  radiusMetres,
  onPick,
}: {
  latitude: number | null;
  longitude: number | null;
  radiusMetres: number;
  onPick: (lat: number, lng: number) => void;
}) {
  const centre = useMemo((): [number, number] => {
    if (latitude != null && longitude != null) return [latitude, longitude];
    return [1.3733, 32.2903];
  }, [latitude, longitude]);

  const accent =
    typeof window !== 'undefined'
      ? getComputedStyle(document.documentElement)
          .getPropertyValue('--color-accent')
          .trim() || '#4F6EF7'
      : '#4F6EF7';

  return (
    <div className="h-56 w-full overflow-hidden rounded-xl border border-theme">
      <MapContainer
        center={centre}
        zoom={latitude != null ? 16 : 7}
        className="h-full w-full"
        scrollWheelZoom
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <ClickHandler onPick={onPick} />
        {latitude != null && longitude != null ? (
          <>
            <Marker position={[latitude, longitude]} />
            <Circle
              center={[latitude, longitude]}
              radius={radiusMetres}
              pathOptions={{
                color: accent,
                fillColor: accent,
                fillOpacity: 0.08,
                weight: 2,
              }}
            />
          </>
        ) : null}
      </MapContainer>
    </div>
  );
}
