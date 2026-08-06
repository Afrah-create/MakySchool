"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Notification } from "@makyschool/shared/types";
import { createNotificationSSEConnection, getUnreadCount, markAllAsRead, markAsRead } from "@/lib/api/notifications";

type NotificationContextValue = {
  unreadCount: number;
  latestNotification: Notification | null;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refresh: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestNotification, setLatestNotification] = useState<Notification | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { count } = await getUnreadCount();
      setUnreadCount(count);
    } catch {
      // keep stale state on failure
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const cleanup = createNotificationSSEConnection((event, data) => {
      if (event === "connected") {
        const eventCount = Number((data as { unreadCount?: number }).unreadCount ?? 0);
        if (Number.isFinite(eventCount)) {
          setUnreadCount(eventCount);
        }
      }

      if (event === "unread_count") {
        const eventCount = Number((data as { count?: number }).count ?? 0);
        if (Number.isFinite(eventCount)) {
          setUnreadCount(eventCount);
        }
      }

      if (event === "notification") {
        const payload = data as Partial<Notification> & { id?: string };
        if (payload.id) {
          const notification: Notification = {
            id: payload.id,
            type: (payload.type as Notification["type"]) ?? "admin.generated.report_card",
            title: payload.title ?? "New notification",
            body: payload.body ?? "",
            resourceType: payload.resourceType ?? null,
            resourceId: payload.resourceId ?? null,
            metadata: (payload.metadata as Record<string, unknown>) ?? {},
            isRead: false,
            readAt: null,
            isArchived: false,
            archivedAt: null,
            actorId: payload.actorId ?? null,
            createdAt: payload.createdAt ?? new Date().toISOString(),
          };
          setLatestNotification(notification);
          setUnreadCount((current) => current + 1);
        }
      }
    });

    return cleanup;
  }, []);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const handleMarkAsRead = useCallback(async (id: string) => {
    await markAsRead(id);
    setUnreadCount((current) => Math.max(0, current - 1));
  }, []);

  const handleMarkAllAsRead = useCallback(async () => {
    await markAllAsRead();
    setUnreadCount(0);
  }, []);

  const value = useMemo(
    () => ({
      unreadCount,
      latestNotification,
      drawerOpen,
      openDrawer,
      closeDrawer,
      markAsRead: handleMarkAsRead,
      markAllAsRead: handleMarkAllAsRead,
      refresh,
    }),
    [drawerOpen, handleMarkAllAsRead, handleMarkAsRead, latestNotification, openDrawer, closeDrawer, refresh, unreadCount],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotificationContext() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotificationContext must be used within a NotificationProvider");
  }
  return context;
}
