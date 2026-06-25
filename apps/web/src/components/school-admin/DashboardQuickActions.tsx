"use client";

import Link from "next/link";
import { GraduationCap, Upload, UserPlus, Users } from "lucide-react";
import type { PermissionAction } from "@makyschool/shared/constants";
import { CanDo } from "@/components/ui/CanDo";

const staffActions = [
  {
    href: "/dashboard/students?add=1",
    label: "Register student",
    description: "Enrol a new learner and assign a class",
    icon: Users,
    permission: "manageStaff" as PermissionAction,
  },
  {
    href: "/dashboard/teachers?add=1",
    label: "Add teacher",
    description: "Create a staff account with class assignments",
    icon: GraduationCap,
    permission: "manageStaff" as PermissionAction,
  },
  {
    href: "/dashboard/students?import=1",
    label: "Import students",
    description: "Bulk enrol from a CSV file",
    icon: Upload,
    permission: "manageStaff" as PermissionAction,
  },
] as const;

const adminActions = [
  {
    href: "/dashboard/users?add=1",
    label: "Add user",
    description: "Invite head teachers or other staff",
    icon: UserPlus,
    permission: "manageUsers" as PermissionAction,
  },
] as const;

export function DashboardQuickActions() {
  return (
    <div>
      <h2 className="text-sm font-semibold text-theme-primary">Quick actions</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {staffActions.map((action) => (
          <CanDo key={action.href} action={action.permission}>
            <QuickActionCard {...action} />
          </CanDo>
        ))}
        {adminActions.map((action) => (
          <CanDo key={action.href} action={action.permission}>
            <QuickActionCard {...action} />
          </CanDo>
        ))}
      </div>
    </div>
  );
}

function QuickActionCard({
  href,
  label,
  description,
  icon: Icon,
}: {
  href: string;
  label: string;
  description: string;
  icon: typeof Users;
}) {
  return (
    <Link
      href={href}
      className="ms-card group flex flex-col gap-3 p-4 transition hover:border-accent-soft"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-theme-accent-muted text-theme-accent">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-semibold text-theme-primary group-hover:text-theme-accent">
          {label}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-theme-muted">{description}</p>
      </div>
    </Link>
  );
}
