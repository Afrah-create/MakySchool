import { BookOpen, BookOpenCheck, CalendarDays, ClipboardList, Clock3, FileText, FolderOpen, LayoutDashboard, Shield, User } from "lucide-react";
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
      {
        id: "teacher-timetable",
        href: "/teacher/timetable",
        label: "Timetable",
        icon: Clock3,
        exact: false,
        roles: teacherRole,
      },
      {
        id: "teacher-teaching-plans",
        href: "/teacher/teaching-plans",
        label: "Teaching plans",
        icon: FileText,
        exact: false,
        roles: teacherRole,
      },
      {
        id: "teacher-resources",
        href: "/teacher/resources",
        label: "Resources",
        icon: FolderOpen,
        exact: false,
        roles: teacherRole,
      },
      {
        id: "teacher-primary-grades",
        href: "/teacher/primary/grades",
        label: "Primary marks",
        icon: ClipboardList,
        exact: false,
        roles: teacherRole,
      },
      {
        id: "teacher-alevel-grades",
        href: "/teacher/alevel/grades",
        label: "A-Level marks",
        icon: BookOpenCheck,
        exact: false,
        roles: teacherRole,
      },
    ],
  },
  {
    id: "attendance",
    label: "Attendance",
    icon: CalendarDays,
    items: [
      {
        id: "teacher-my-attendance",
        href: "/teacher/my-attendance",
        label: "My check-in",
        icon: Clock3,
        exact: false,
        roles: teacherRole,
      },
      {
        id: "teacher-attendance",
        href: "/teacher/attendance",
        label: "Class attendance",
        icon: CalendarDays,
        exact: false,
        roles: teacherRole,
      },
    ],
  },
  {
    id: "discipline",
    label: "Discipline",
    icon: Shield,
    items: [
      {
        id: "teacher-discipline",
        href: "/teacher/discipline",
        label: "My incidents",
        icon: Shield,
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
