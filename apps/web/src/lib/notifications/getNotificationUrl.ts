import type { Notification } from "@makyschool/shared/types";

export function getNotificationUrl(
  resourceType: string | null,
  resourceId: string | null,
  metadata: Record<string, unknown>,
  userRole: string,
) {
  if (!resourceType || !resourceId) return null;

  const curriculum = String(metadata.curriculum ?? "").toLowerCase();
  const id = String(resourceId);

  switch (resourceType) {
    case "exam_session": {
      if (userRole === "admin" || userRole === "head_teacher") {
        if (curriculum === "alevel") {
          return `/dashboard/alevel/grades?sessionId=${id}`;
        }
        if (curriculum === "primary") {
          return "/dashboard/primary/marks";
        }
        return "/dashboard/olevel/exam-sessions";
      }
      return null;
    }
    case "teaching_plan": {
      if (userRole === "admin" || userRole === "head_teacher") {
        return "/dashboard/teaching-plans";
      }
      return null;
    }
    case "attendance_period": {
      if (userRole === "admin" || userRole === "head_teacher") {
        return "/dashboard/attendance";
      }
      return null;
    }
    case "invoice": {
      if (userRole === "learner") {
        return "/learner/fees";
      }
      if (userRole === "bursar" || userRole === "admin") {
        return "/bursar/invoices";
      }
      return null;
    }
    case "fee_payment": {
      if (userRole === "learner") {
        return "/learner/fees";
      }
      if (userRole === "bursar" || userRole === "admin") {
        return "/bursar/payments";
      }
      return null;
    }
    case "subject_resource": {
      if (userRole === "learner") {
        return "/learner/resources";
      }
      return null;
    }
    case "report_card": {
      if (userRole === "learner") {
        return "/learner/results";
      }
      if (userRole === "admin" || userRole === "head_teacher") {
        return "/dashboard/results";
      }
      return null;
    }
    default:
      return null;
  }
}

export function getNotificationHref(notification: Notification, userRole: string) {
  return getNotificationUrl(notification.resourceType, notification.resourceId, notification.metadata, userRole);
}
