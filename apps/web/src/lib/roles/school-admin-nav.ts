import type { LucideIcon } from "lucide-react";
import { BookOpen, CreditCard, LayoutDashboard, Settings2 } from "lucide-react";
import { USER_ROLES } from "@makyschool/shared/constants";
import type { UserRole } from "@makyschool/shared/types";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact: boolean;
  roles: readonly UserRole[];
};

const allSchoolAdminRoles = [USER_ROLES.ADMIN, USER_ROLES.HEAD_TEACHER] as const;
const adminOnly = [USER_ROLES.ADMIN] as const;

export const schoolAdminNav: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
    roles: allSchoolAdminRoles,
  },
  {
    href: "/dashboard/classes",
    label: "Classes & subjects",
    icon: BookOpen,
    exact: false,
    roles: allSchoolAdminRoles,
  },
  {
    href: "/dashboard/settings",
    label: "School settings",
    icon: Settings2,
    exact: false,
    roles: adminOnly,
  },
  {
    href: "/dashboard/billing",
    label: "Billing",
    icon: CreditCard,
    exact: false,
    roles: adminOnly,
  },
];

export const schoolAdminSetupNav: NavItem[] = [
  {
    href: "/dashboard/setup",
    label: "Setup wizard",
    icon: LayoutDashboard,
    exact: false,
    roles: allSchoolAdminRoles,
  },
];

export function filterNavByRole(items: NavItem[], role: UserRole): NavItem[] {
  return items.filter((item) => item.roles.includes(role));
}
