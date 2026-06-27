import { BookOpen, LayoutDashboard, User } from "lucide-react";
import { USER_ROLES } from "@makyschool/shared/constants";
import type { PortalNavGroup, PortalNavItem } from "./portal-nav";

export type { PortalNavItem as NavItem };

const teacherRole = [USER_ROLES.TEACHER] as const;

export const teacherNavGroups: PortalNavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    items: [
      {
        id: "teacher-dashboard",
        href: "/teacher/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        exact: true,
        roles: teacherRole,
      },
    ],
  },
  {
    id: "teaching",
    label: "Teaching",
    icon: BookOpen,
    items: [
      {
        id: "teacher-classes",
        href: "/teacher/classes",
        label: "My classes",
        icon: BookOpen,
        exact: false,
        roles: teacherRole,
      },
    ],
  },
  {
    id: "account",
    label: "Account",
    icon: User,
    items: [
      {
        id: "teacher-profile",
        href: "/teacher/profile",
        label: "My profile",
        icon: User,
        exact: false,
        roles: teacherRole,
      },
    ],
  },
];

/** @deprecated Use teacherNavGroups */
export const teacherNav: PortalNavItem[] = teacherNavGroups.flatMap((group) => group.items);
