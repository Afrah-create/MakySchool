import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  BadgePercent,
  CalendarCheck,
  ClipboardList,
  CreditCard,
  FileCheck,
  FileText,
  LockOpen,
  Receipt,
  Upload,
} from "lucide-react";
import type { NotificationType } from "@makyschool/shared/types";

export function getNotificationIcon(type: NotificationType): LucideIcon {
  if (type === "teacher.submitted.alevel_marks" || type === "teacher.submitted.olevel_marks" || type === "teacher.submitted.primary_marks") {
    return FileCheck;
  }
  if (type === "admin.opened.exam_session") return ClipboardList;
  if (type === "admin.unlocked.marks") return LockOpen;
  if (type === "teacher.submitted.attendance") return CalendarCheck;
  if (type === "teacher.uploaded.teaching_plan") return Upload;
  if (type === "teacher.published.resource") return BookOpen;
  if (type === "admin.created.invoice") return Receipt;
  if (type === "admin.recorded.payment") return CreditCard;
  if (type === "admin.waived.fee") return BadgePercent;
  if (type === "admin.generated.report_card") return FileText;
  return Bell;
}
