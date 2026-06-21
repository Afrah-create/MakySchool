import type { LucideIcon } from "lucide-react";
import { BookOpen, LayoutDashboard } from "lucide-react";
import { USER_ROLES } from "@makyschool/shared/constants";
import type { UserRole } from "@makyschool/shared/types";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact: boolean;
  roles: readonly UserRole[];
};

export const teacherNav: NavItem[] = [
  {
    href: "/teacher/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
    roles: [USER_ROLES.TEACHER],
  },
  {
    href: "/teacher/classes",
    label: "My classes",
    icon: BookOpen,
    exact: false,
    roles: [USER_ROLES.TEACHER],
  },
];
