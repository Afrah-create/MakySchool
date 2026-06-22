import { BookOpen, LayoutDashboard, User } from "lucide-react";
import { USER_ROLES } from "@makyschool/shared/constants";
import type { PortalNavItem } from "./portal-nav";

export type { PortalNavItem as NavItem };

export const teacherNav: PortalNavItem[] = [
  {
    id: "teacher-dashboard",
    href: "/teacher/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
    roles: [USER_ROLES.TEACHER],
  },
  {
    id: "teacher-classes",
    href: "/teacher/classes",
    label: "My Classes",
    icon: BookOpen,
    exact: false,
    roles: [USER_ROLES.TEACHER],
  },
  {
    id: "teacher-profile",
    href: "/teacher/profile",
    label: "My Profile",
    icon: User,
    exact: false,
    roles: [USER_ROLES.TEACHER],
  },
];
