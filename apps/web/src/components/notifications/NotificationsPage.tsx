"use client";

import { useMemo, useState } from "react";
import { Bell, BookOpen, CalendarCheck, FileCheck,
         ClipboardList, LockOpen, Upload, Receipt,
         CreditCard, BadgePercent, FileText } from "lucide-react";
import { cn } from "@makyschool/ui/lib/cn";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { useNotificationContext } from "@/contexts/NotificationContext";
import { useNotifications } from "@/hooks/useNotifications";
import { archiveAllRead } from "@/lib/api/notifications";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import type { Notification } from "@makyschool/shared/types";

// ── Types ────────────────────────────────────────────────────────────────────

type FilterTab = "all" | "unread" | "archived";

const TAB_OPTIONS: Array<{ key: FilterTab; label: string }> = [
  { key: "all",      label: "All"      },
  { key: "unread",   label: "Unread"   },
  { key: "archived", label: "Archived" },
];

const TYPE_LABELS: Record<string, string> = {
  "teacher.submitted.alevel_marks":   "A-Level marks submitted",
  "teacher.submitted.olevel_marks":   "O-Level marks submitted",
  "teacher.submitted.primary_marks":  "Primary marks submitted",
  "admin.opened.exam_session":        "Exam session opened",
  "admin.unlocked.marks":             "Marks unlocked",
  "teacher.submitted.attendance":     "Attendance submitted",
  "teacher.uploaded.teaching_plan":   "Teaching plan uploaded",
  "teacher.published.resource":       "Resource published",
  "admin.created.invoice":            "Invoice created",
  "admin.recorded.payment":           "Payment recorded",
  "admin.waived.fee":                 "Fee waived",
  "admin.generated.report_card":      "Report card ready",
};

// Types visible per role
const TYPES_BY_ROLE: Record<string, string[]> = {
  admin: [
    "teacher.submitted.alevel_marks",
    "teacher.submitted.olevel_marks",
    "teacher.submitted.primary_marks",
    "admin.opened.exam_session",
    "admin.unlocked.marks",
    "teacher.submitted.attendance",
    "teacher.uploaded.teaching_plan",
    "admin.created.invoice",
    "admin.recorded.payment",
    "admin.waived.fee",
    "admin.generated.report_card",
  ],
  head_teacher: [
    "teacher.submitted.alevel_marks",
    "teacher.submitted.olevel_marks",
    "teacher.submitted.primary_marks",
    "teacher.submitted.attendance",
    "teacher.uploaded.teaching_plan",
    "admin.generated.report_card",
  ],
  teacher: [
    "admin.opened.exam_session",
    "admin.unlocked.marks",
  ],
  bursar: [
    "admin.created.invoice",
    "admin.recorded.payment",
    "admin.waived.fee",
  ],
  learner: [
    "admin.created.invoice",
    "admin.recorded.payment",
    "admin.waived.fee",
    "teacher.published.resource",
    "admin.generated.report_card",
  ],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function groupNotifications(
  notifications: Notification[],
): Array<[string, Notification[]]> {
  const now = new Date();
  const groups: Record<string, Notification[]> = {
    Today: [],
    Yesterday: [],
    "This week": [],
    Earlier: [],
  };

  for (const item of notifications) {
    const created = new Date(item.createdAt);
    const diffMs = now.getTime() - created.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) groups.Today.push(item);
    else if (diffDays === 1) groups.Yesterday.push(item);
    else if (diffDays < 7) groups["This week"].push(item);
    else groups.Earlier.push(item);
  }

  return Object.entries(groups).filter(([, items]) => items.length > 0);
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function NotificationPageSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 rounded-xl border border-theme bg-theme-surface p-4"
        >
          <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-3.5 w-1/3 rounded" />
            <Skeleton className="h-3 w-full rounded" />
            <Skeleton className="h-3 w-2/3 rounded" />
            <Skeleton className="h-2.5 w-1/5 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Summary stat strip ───────────────────────────────────────────────────────

function NotificationStats({
  unreadCount,
  total,
}: {
  unreadCount: number;
  total: number;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[
        { label: "Total notifications", value: total, icon: Bell },
        { label: "Unread",              value: unreadCount, icon: BookOpen },
      ].map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.label}
            className="flex items-center gap-3 rounded-xl border border-theme bg-theme-surface px-4 py-3"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-theme-accent-muted text-theme-accent">
              <Icon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs text-theme-muted">{stat.label}</p>
              <p className="text-xl font-semibold tabular-nums text-theme-primary">
                {stat.value}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main page component ──────────────────────────────────────────────────────

export function NotificationsPage({ userRole }: { userRole: string }) {
  const [tab, setTab]   = useState<FilterTab>("all");
  const [type, setType] = useState("all");

  const { unreadCount, markAsRead, markAllAsRead } = useNotificationContext();

  const params = useMemo(
    () => ({
      limit:       50,
      offset:      0,
      is_archived: tab === "archived",
      is_read:     tab === "unread" ? false : undefined,
      type:        type === "all" ? undefined : type,
    }),
    [tab, type],
  );

  const { data, isLoading, error, mutate } = useNotifications(params);
  const notifications = data?.notifications ?? [];
  const total         = data?.total ?? 0;

  const availableTypes = useMemo(
    () => TYPES_BY_ROLE[userRole] ?? Object.keys(TYPE_LABELS),
    [userRole],
  );

  const handleArchiveAllRead = async () => {
    await archiveAllRead();
    void mutate();
  };

  const hasArchivable = notifications.some((n) => n.isRead && !n.isArchived);
  const grouped       = useMemo(() => groupNotifications(notifications), [notifications]);

  const emptyTitle = tab === "unread"
    ? "You're all caught up"
    : tab === "archived"
      ? "No archived notifications"
      : "No notifications yet";

  const emptyDescription = tab === "unread"
    ? "No unread notifications right now."
    : tab === "archived"
      ? "Notifications you archive will appear here."
      : "Notifications will appear here when something happens.";

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-theme-primary">
            Notifications
          </h1>
          <p className="mt-0.5 text-sm text-theme-muted">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllAsRead()}
              className="rounded-lg border border-theme bg-theme-surface px-3 py-2 text-sm font-medium text-theme-primary hover:bg-theme-page transition-colors"
            >
              Mark all as read
            </button>
          )}
          {hasArchivable && (
            <button
              type="button"
              onClick={() => void handleArchiveAllRead()}
              className="rounded-lg border border-theme bg-theme-surface px-3 py-2 text-sm font-medium text-theme-muted hover:text-theme-primary transition-colors"
            >
              Archive all read
            </button>
          )}
        </div>
      </div>

      {/* Stats strip */}
      <NotificationStats unreadCount={unreadCount} total={total} />

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-xl border border-theme bg-theme-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Tabs */}
        <div className="flex flex-wrap gap-1.5">
          {TAB_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setTab(option.key)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                tab === option.key
                  ? "bg-theme-accent text-white shadow-sm"
                  : "text-theme-muted hover:bg-theme-page hover:text-theme-primary",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-lg border border-theme bg-theme-page px-3 py-2 text-sm text-theme-primary focus:border-theme-accent focus:outline-none"
        >
          <option value="all">All types</option>
          {availableTypes.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t] ?? t}
            </option>
          ))}
        </select>
      </div>

      {/* List */}
      {isLoading ? (
        <NotificationPageSkeleton />
      ) : error ? (
        <div className="rounded-xl border border-theme bg-theme-surface px-5 py-10 text-center">
          <p className="font-medium text-theme-primary">
            Unable to load notifications
          </p>
          <p className="mt-1 text-sm text-theme-muted">
            Please try again.
          </p>
          <button
            type="button"
            onClick={() => void mutate()}
            className="mt-4 rounded-lg border border-theme bg-theme-page px-3 py-2 text-sm font-medium text-theme-primary hover:bg-theme-surface transition-colors"
          >
            Retry
          </button>
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(([label, items]) => (
            <section key={label}>
              {/* Date group heading */}
              <div className="mb-3 flex items-center gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-theme-muted">
                  {label}
                </h3>
                <span className="flex-1 border-t border-theme" />
                <span className="text-xs text-theme-faint">
                  {items.length}
                </span>
              </div>

              <div className="space-y-2">
                {items.map((item) => (
                  <NotificationItem
                    key={item.id}
                    notification={item}
                    compact={false}
                    userRole={userRole}
                    onRead={(id) => void markAsRead(id)}
                    onArchive={
                      tab !== "archived"
                        ? async (id) => {
                            const { archiveNotification } = await import(
                              "@/lib/api/notifications"
                            );
                            await archiveNotification(id);
                            void mutate();
                          }
                        : undefined
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}