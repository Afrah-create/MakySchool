"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Archive, Trash2 } from "lucide-react";
import { cn } from "@makyschool/ui/lib/cn";
import type { Notification } from "@makyschool/shared/types";
import { getNotificationHref } from "@/lib/notifications/getNotificationUrl";
import { formatRelativeTime } from "@/lib/notifications/formatRelativeTime";
import { getNotificationIcon } from "@/lib/notifications/getNotificationIcon";

export function NotificationItem({
  notification,
  compact = false,
  userRole,
  onRead,
  onArchive,
  onDelete,
}: {
  notification: Notification;
  compact?: boolean;
  userRole: string;
  onRead: (id: string) => void;
  onArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const href = useMemo(
    () => getNotificationHref(notification, userRole),
    [notification, userRole],
  );
  const Icon = getNotificationIcon(notification.type);
  const isUnread = !notification.isRead;

  const content = (
    <div
      className={cn(
        "group relative flex w-full items-start gap-3 rounded-xl border transition-colors duration-150",
        compact ? "min-h-[72px] p-3" : "min-h-[88px] p-4",
        isUnread
          ? "border-theme bg-theme-surface hover:bg-theme-accent-muted/20"
          : "border-theme bg-theme-page hover:bg-theme-surface",
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Unread indicator strip */}
      {isUnread && (
        <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-theme-accent" />
      )}

      {/* Icon */}
      <span
        className={cn(
          "mt-0.5 flex shrink-0 items-center justify-center rounded-lg",
          compact ? "h-8 w-8" : "h-10 w-10",
          isUnread
            ? "bg-theme-accent-muted text-theme-accent"
            : "bg-theme-surface text-theme-muted",
        )}
      >
        <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      </span>

      {/* Body */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              "font-semibold leading-snug text-theme-primary",
              compact ? "text-sm" : "text-[15px]",
              compact && "truncate",
            )}
          >
            {notification.title}
          </p>

          <div className="flex shrink-0 items-center gap-1.5 pl-2">
            {isUnread && (
              <span className="h-2 w-2 rounded-full bg-theme-accent" />
            )}
            {hovered && isUnread && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRead(notification.id);
                }}
                title="Mark as read"
                className="rounded-md border border-theme bg-theme-page p-1 text-theme-muted hover:text-theme-primary"
              >
                <Check className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        <p
          className={cn(
            "mt-1 text-theme-muted",
            compact ? "line-clamp-2 text-xs" : "text-sm",
          )}
        >
          {notification.body}
        </p>

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-theme-faint">
            {formatRelativeTime(notification.createdAt)}
          </span>

          {!compact && (
            <div className="flex items-center gap-1">
              {notification.isRead && onArchive && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onArchive(notification.id);
                  }}
                  title="Archive"
                  className="rounded-md border border-theme bg-theme-page p-1 text-theme-muted hover:text-theme-primary"
                >
                  <Archive className="h-3.5 w-3.5" />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete(notification.id);
                  }}
                  title="Delete"
                  className="rounded-md border border-theme bg-theme-page p-1 text-theme-muted hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block" onClick={() => onRead(notification.id)}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className="block w-full text-left"
      onClick={() => onRead(notification.id)}
    >
      {content}
    </button>
  );
}