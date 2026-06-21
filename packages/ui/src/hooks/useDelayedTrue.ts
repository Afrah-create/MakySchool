"use client";

import { useEffect, useState } from "react";

export function useDelayedTrue(value: boolean, delayMs: number) {
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    if (!value) {
      const timer = window.setTimeout(() => setDelayed(false), 0);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => setDelayed(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return delayed;
}
