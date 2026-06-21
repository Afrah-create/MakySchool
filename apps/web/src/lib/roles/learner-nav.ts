import type { LucideIcon } from "lucide-react";
import { CalendarDays, LayoutDashboard } from "lucide-react";
import { USER_ROLES } from "@makyschool/shared/constants";
import type { UserRole } from "@makyschool/shared/types";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact: boolean;
  roles: readonly UserRole[];
};

export const learnerNav: NavItem[] = [
  {
    href: "/learner/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
    roles: [USER_ROLES.LEARNER],
  },
  {
    href: "/learner/timetable",
    label: "Timetable",
    icon: CalendarDays,
    exact: false,
    roles: [USER_ROLES.LEARNER],
  },
];
