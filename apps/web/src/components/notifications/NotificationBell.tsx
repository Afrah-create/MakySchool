"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { cn } from "@makyschool/ui/lib/cn";
import { useNotificationContext } from "@/contexts/NotificationContext";

export function NotificationBell() {
  const { unreadCount, latestNotification, openDrawer } = useNotificationContext();
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (!latestNotification) return;
    setAnimate(true);
    const timer = window.setTimeout(() => setAnimate(false), 600);
    return () => window.clearTimeout(timer);
  }, [latestNotification]);

  const label = useMemo(() => (unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"), [unreadCount]);

  return (
    <button
      type="button"
      onClick={openDrawer}
      aria-label={label}
      className={cn("relative rounded-lg p-2 text-theme-muted transition hover:bg-nav-hover hover:text-theme-primary", animate && "animate-[shake_0.45s_ease-in-out]")}
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </button>
  );
}
