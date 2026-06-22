"use client";

import Link from "next/link";
import { GraduationCap, Upload, UserPlus, Users } from "lucide-react";
import { CanDo } from "@/components/ui/CanDo";

const actions = [
  {
    href: "/dashboard/students?add=1",
    label: "Register student",
    description: "Enrol a new learner and assign a class",
    icon: Users,
  },
  {
    href: "/dashboard/teachers?add=1",
    label: "Add teacher",
    description: "Create a staff account with class assignments",
    icon: GraduationCap,
  },
  {
    href: "/dashboard/students?import=1",
    label: "Import students",
    description: "Bulk enrol from a CSV file",
    icon: Upload,
  },
  {
    href: "/dashboard/users?add=1",
    label: "Add user",
    description: "Invite head teachers or other staff",
    icon: UserPlus,
  },
] as const;

export function DashboardQuickActions() {
  return (
    <CanDo action="manageUsers">
      <div>
        <h2 className="text-sm font-semibold text-theme-primary">Quick actions</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="ms-card group flex flex-col gap-3 p-4 transition hover:border-accent-soft"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-theme-accent-muted text-theme-accent">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-theme-primary group-hover:text-theme-accent">
                    {action.label}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-theme-muted">{action.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </CanDo>
  );
}
