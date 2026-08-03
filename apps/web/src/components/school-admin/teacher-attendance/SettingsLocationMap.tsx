'use client';

import { useMemo } from 'react';
import { Circle, Map, Marker } from '@vis.gl/react-google-maps';
import {
  GoogleMapsProvider,
  UGANDA_CENTRE,
  cssAccent,
} from '@/components/maps/GoogleMapsProvider';

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
  const hasPin = latitude != null && longitude != null;
  const centre = useMemo(
    () => (hasPin ? { lat: latitude!, lng: longitude! } : UGANDA_CENTRE),
    [hasPin, latitude, longitude],
  );
  const accent = cssAccent();

  return (
    <div className="h-56 w-full overflow-hidden rounded-xl border border-theme">
      <GoogleMapsProvider>
        <Map
          defaultCenter={centre}
          defaultZoom={hasPin ? 16 : 7}
          center={hasPin ? centre : undefined}
          gestureHandling="greedy"
          disableDefaultUI={false}
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          className="h-full w-full"
          onClick={(e) => {
            const lat = e.detail.latLng?.lat;
            const lng = e.detail.latLng?.lng;
            if (lat == null || lng == null) return;
            onPick(lat, lng);
          }}
        >
          {hasPin ? (
            <>
              <Marker position={{ lat: latitude!, lng: longitude! }} />
              <Circle
                center={{ lat: latitude!, lng: longitude! }}
                radius={radiusMetres}
                strokeColor={accent}
                strokeOpacity={0.9}
                strokeWeight={2}
                fillColor={accent}
                fillOpacity={0.08}
              />
            </>
          ) : null}
        </Map>
      </GoogleMapsProvider>
    </div>
  );
}
