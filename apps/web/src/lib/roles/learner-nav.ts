import type { PortalNavItem } from "./portal-nav";
import { CalendarDays, LayoutDashboard } from "lucide-react";
import { USER_ROLES } from "@makyschool/shared/constants";

export type { PortalNavItem as NavItem };

export const learnerNav: PortalNavItem[] = [
  {
    id: "learner-dashboard",
    href: "/learner/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
    roles: [USER_ROLES.LEARNER],
  },
  {
    id: "learner-timetable",
    href: "/learner/timetable",
    label: "Timetable",
    icon: CalendarDays,
    exact: false,
    roles: [USER_ROLES.LEARNER],
  },
];
