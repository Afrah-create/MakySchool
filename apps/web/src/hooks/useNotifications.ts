"use client";

import { useEffect, useMemo, useState } from "react";
import type { Notification, NotificationPreference } from "@makyschool/shared/types";
import { getNotifications, getPreferences } from "@/lib/api/notifications";

export function useNotifications(params: {
  limit?: number;
  offset?: number;
  is_read?: boolean;
  is_archived?: boolean;
  type?: string;
} = {}) {
  const [data, setData] = useState<{ notifications: Notification[]; total: number; unreadCount: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const queryKey = useMemo(() => JSON.stringify(params), [params]);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setError(null);
    void getNotifications(params)
      .then((payload) => {
        if (!mounted) return;
        setData(payload);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err : new Error("Failed to load notifications"));
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [queryKey]);

  return { data, isLoading, error, mutate: () => void getNotifications(params).then(setData) };
}

export function useNotificationPreferences() {
  const [data, setData] = useState<NotificationPreference[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setError(null);
    void getPreferences()
      .then((payload) => {
        if (!mounted) return;
        setData(payload.preferences);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err : new Error("Failed to load preferences"));
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return { data, isLoading, error };
}
