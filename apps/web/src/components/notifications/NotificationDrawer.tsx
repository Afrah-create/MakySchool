"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, X } from "lucide-react";
import { cn } from "@makyschool/ui/lib/cn";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { useNotificationContext } from "@/contexts/NotificationContext";
import { useNotifications } from "@/hooks/useNotifications";
import { archiveAllRead } from "@/lib/api/notifications";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import type { Notification } from "@makyschool/shared/types";

function NotificationDrawerSkeleton() {
  return (
    <div className="space-y-2 px-3 py-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 rounded-xl border border-theme bg-theme-surface p-3"
        >
          <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2 pt-0.5">
            <Skeleton className="h-3 w-2/3 rounded" />
            <Skeleton className="h-3 w-full rounded" />
            <Skeleton className="h-2.5 w-1/4 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function NotificationDrawer({ userRole }: { userRole: string }) {
  const { unreadCount, drawerOpen, closeDrawer, markAsRead, markAllAsRead } =
    useNotificationContext();

  const [localItems, setLocalItems] = useState<Notification[]>([]);

  const { data, isLoading, error, mutate } = useNotifications({
    limit: 20,
    is_archived: false,
  });

  useEffect(() => {
    if (data?.notifications) {
      setLocalItems(data.notifications);
    }
  }, [data]);

  // Re-sync when drawer opens
  useEffect(() => {
    if (drawerOpen) void mutate();
  }, [drawerOpen, mutate]);

  const handleMarkAsRead = async (id: string) => {
    setLocalItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isRead: true } : item)),
    );
    await markAsRead(id);
  };

  const handleArchiveAllRead = async () => {
    await archiveAllRead();
    setLocalItems((prev) => prev.filter((item) => !item.isRead));
    void mutate();
  };

  // Derive the notifications page path from userRole
  const notificationsHref = useMemo(() => {
    if (userRole === "teacher") return "/teacher/notifications";
    if (userRole === "bursar") return "/bursar/notifications";
    if (userRole === "learner") return "/learner/notifications";
    return "/dashboard/notifications";
  }, [userRole]);

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 transition-all duration-300",
        drawerOpen ? "pointer-events-auto" : "pointer-events-none",
      )}
    >
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0 bg-black/25 backdrop-blur-[2px] transition-opacity duration-300",
          drawerOpen ? "opacity-100" : "opacity-0",
        )}
        onClick={closeDrawer}
      />

      {/* Panel */}
      <aside
        className={cn(
          "absolute right-0 top-0 flex h-full w-full max-w-[22rem] flex-col border-l border-theme bg-theme-page shadow-2xl transition-transform duration-300 ease-in-out",
          drawerOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-theme px-4 py-3.5">
          <div>
            <h2 className="text-base font-semibold text-theme-primary">
              Notifications
            </h2>
            {unreadCount > 0 ? (
              <p className="text-xs text-theme-muted">
                {unreadCount} unread
              </p>
            ) : (
              <p className="text-xs text-theme-faint">All caught up</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllAsRead()}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-theme-accent hover:bg-theme-accent-muted transition-colors"
              >
                Mark all read
              </button>
            )}
            <button
              type="button"
              onClick={closeDrawer}
              aria-label="Close notifications"
              className="rounded-lg p-1.5 text-theme-muted hover:bg-theme-surface hover:text-theme-primary transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && localItems.length === 0 ? (
            <NotificationDrawerSkeleton />
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
              <p className="text-sm font-medium text-theme-primary">
                Unable to load notifications
              </p>
              <p className="mt-1 text-xs text-theme-muted">
                Please try again shortly.
              </p>
              <button
                type="button"
                onClick={() => void mutate()}
                className="mt-4 rounded-lg border border-theme bg-theme-surface px-3 py-1.5 text-xs font-medium text-theme-primary hover:bg-theme-page transition-colors"
              >
                Retry
              </button>
            </div>
          ) : localItems.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-theme-surface">
                <Bell className="h-7 w-7 text-theme-muted" />
              </span>
              <h3 className="mt-4 text-sm font-semibold text-theme-primary">
                You&apos;re all caught up
              </h3>
              <p className="mt-1 text-xs text-theme-muted">
                No new notifications right now.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 px-3 py-3">
              {localItems.map((item) => (
                <NotificationItem
                  key={item.id}
                  notification={item}
                  compact
                  userRole={userRole}
                  onRead={handleMarkAsRead}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-theme px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <Link
              href={notificationsHref}
              className="text-sm font-medium text-theme-accent hover:underline"
              onClick={closeDrawer}
            >
              View all notifications
            </Link>
            {localItems.some((item) => item.isRead) && (
              <button
                type="button"
                onClick={() => void handleArchiveAllRead()}
                className="text-xs text-theme-muted hover:text-theme-primary transition-colors"
              >
                Archive read
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}