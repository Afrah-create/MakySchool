import { Bell, BookOpen, CalendarDays, CreditCard, FileText, LayoutDashboard, UserRound } from "lucide-react";
import { USER_ROLES } from "@makyschool/shared/constants";
import type { PortalNavGroup, PortalNavItem } from "./portal-nav";

const learnerRole = [USER_ROLES.LEARNER] as const;

export const learnerNavGroups: PortalNavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    items: [
      {
        id: "learner-dashboard",
        href: "/learner/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        exact: true,
        roles: learnerRole,
      },
      {
        id: "learner-profile",
        href: "/learner/profile",
        label: "Profile",
        icon: UserRound,
        exact: false,
        roles: learnerRole,
      },
      {
        id: "learner-notifications",
        href: "/learner/notifications",
        label: "Notifications",
        icon: Bell,
        exact: true,
        roles: learnerRole,
      },
    ],
  },
  {
    id: "academic",
    label: "Academic",
    icon: CalendarDays,
    items: [
      {
        id: "learner-attendance",
        href: "/learner/attendance",
        label: "Attendance",
        icon: CalendarDays,
        exact: false,
        roles: learnerRole,
      },
      {
        id: "learner-resources",
        href: "/learner/resources",
        label: "Resources",
        icon: BookOpen,
        exact: false,
        roles: learnerRole,
      },
      {
        id: "learner-report-cards",
        href: "/learner/report-cards",
        label: "Report cards",
        icon: FileText,
        exact: false,
        roles: learnerRole,
      },
      {
        id: "learner-fees",
        href: "/learner/fees",
        label: "Fees",
        icon: CreditCard,
        exact: false,
        roles: learnerRole,
      },
      {
        id: "learner-timetable",
        href: "/learner/timetable",
        label: "Timetable",
        icon: CalendarDays,
        exact: false,
        roles: learnerRole,
      },
    ],
  },
];

/** @deprecated Use learnerNavGroups */
export const learnerNav: PortalNavItem[] = learnerNavGroups.flatMap((group) => group.items);

export type { PortalNavItem as NavItem };
