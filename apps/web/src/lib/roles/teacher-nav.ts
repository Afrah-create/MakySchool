import type { LucideIcon } from "lucide-react";
import { BookOpen, LayoutDashboard, User } from "lucide-react";
import { USER_ROLES } from "@makyschool/shared/constants";
import type { PortalNavItem } from "./portal-nav";

export type { PortalNavItem as NavItem };

export const teacherNav: PortalNavItem[] = [
  {
    href: "/teacher/dashboard",
    label: "My Classes",
    icon: BookOpen,
    exact: false,
    roles: [USER_ROLES.TEACHER],
  },
  {
    href: "/teacher/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
    roles: [USER_ROLES.TEACHER],
  },
  {
    href: "/teacher/profile",
    label: "My Profile",
    icon: User,
    exact: false,
    roles: [USER_ROLES.TEACHER],
  },
];
