export type NotificationType =
  | "teacher.submitted.alevel_marks"
  | "teacher.submitted.olevel_marks"
  | "teacher.submitted.primary_marks"
  | "admin.opened.exam_session"
  | "admin.unlocked.marks"
  | "teacher.submitted.attendance"
  | "teacher.uploaded.teaching_plan"
  | "teacher.published.resource"
  | "admin.created.invoice"
  | "admin.recorded.payment"
  | "admin.waived.fee"
  | "admin.generated.report_card";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  isRead: boolean;
  readAt: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  actorId: string | null;
  createdAt: string;
}

export interface NotificationPreference {
  type: NotificationType;
  inAppEnabled: boolean;
}

export interface NotificationsResponse {
  notifications: Notification[];
  total: number;
  unreadCount: number;
}
