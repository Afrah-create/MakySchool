"use client";

import Link from "next/link";
import {
  ClipboardCheck,
  GraduationCap,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import type { PermissionAction } from "@makyschool/shared/constants";
import { CanDo } from "@/components/ui/CanDo";

const actions = [
  {
    href: "/dashboard/students?add=1",
    label: "Register student",
    icon: Users,
    permission: "manageStaff" as PermissionAction,
  },
  {
    href: "/dashboard/teachers?add=1",
    label: "Add teacher",
    icon: GraduationCap,
    permission: "manageStaff" as PermissionAction,
  },
  {
    href: "/dashboard/students?import=1",
    label: "Import CSV",
    icon: Upload,
    permission: "manageStaff" as PermissionAction,
  },
  {
    href: "/dashboard/users?add=1",
    label: "Add user",
    icon: UserPlus,
    permission: "manageUsers" as PermissionAction,
  },
  {
    href: "/dashboard/teacher-attendance",
    label: "Attendance map",
    icon: ClipboardCheck,
    permission: "viewTeacherAttendance" as PermissionAction,
  },
] as const;

export function DashboardQuickActions() {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-theme-primary">
        Quick actions
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {actions.map((action) => (
          <CanDo key={action.href} action={action.permission}>
            <Link
              href={action.href}
              className="ms-card group flex items-center gap-2.5 p-3 transition hover:border-accent-soft"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-theme-accent-muted text-theme-accent">
                <action.icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 truncate text-sm font-medium text-theme-primary group-hover:text-theme-accent">
                {action.label}
              </span>
            </Link>
          </CanDo>
        ))}
      </div>
    </section>
  );
}
