'use client';

import { APIProvider } from '@vis.gl/react-google-maps';

export function getGoogleMapsApiKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return key || undefined;
}

export function GoogleMapsProvider({ children }: { children: React.ReactNode }) {
  const key = getGoogleMapsApiKey();
  if (!key) {
    return (
      <div className="flex h-full min-h-40 items-center justify-center rounded-xl border border-theme bg-theme-raised/40 px-4 text-center text-sm text-theme-muted">
        Google Maps is not configured. Set{' '}
        <code className="mx-1 font-mono text-xs">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>{' '}
        in your environment.
      </div>
    );
  }
  return <APIProvider apiKey={key}>{children}</APIProvider>;
}

export function cssAccent(fallback = '#4F6EF7') {
  if (typeof window === 'undefined') return fallback;
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue('--color-accent')
      .trim() || fallback
  );
}

export function cssVar(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

/** Default map centre — Uganda */
export const UGANDA_CENTRE = { lat: 1.3733, lng: 32.2903 };
