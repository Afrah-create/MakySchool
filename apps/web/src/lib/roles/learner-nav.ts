import { CalendarDays, LayoutDashboard } from "lucide-react";
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
    ],
  },
  {
    id: "academic",
    label: "Academic",
    icon: CalendarDays,
    items: [
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
