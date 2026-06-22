import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  Layers,
  Settings,
  Users,
} from "lucide-react";
import { can, type PermissionAction } from "@makyschool/shared/constants";
import type { UserRole } from "@makyschool/shared/types";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact: boolean;
  requiredAction: PermissionAction | null;
};

export const schoolAdminNav: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
    requiredAction: null,
  },
  {
    href: "/dashboard/classes",
    label: "Classes",
    icon: BookOpen,
    exact: false,
    requiredAction: "viewAllClasses",
  },
  {
    href: "/dashboard/teachers",
    label: "Teachers",
    icon: GraduationCap,
    exact: false,
    requiredAction: "viewAllStaff",
  },
  {
    href: "/dashboard/subjects",
    label: "Subjects",
    icon: Layers,
    exact: false,
    requiredAction: "viewAllClasses",
  },
  {
    href: "/dashboard/users",
    label: "Users",
    icon: Users,
    exact: false,
    requiredAction: "viewAllStaff",
  },
  {
    href: "/dashboard/billing",
    label: "Finance",
    icon: Banknote,
    exact: false,
    requiredAction: "viewFinance",
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: Settings,
    exact: false,
    requiredAction: "manageSchool",
  },
];

export const schoolAdminSetupNav: NavItem[] = [
  {
    href: "/dashboard/setup",
    label: "Setup wizard",
    icon: LayoutDashboard,
    exact: false,
    requiredAction: null,
  },
];

export function filterNavByRole(items: NavItem[], role: UserRole): NavItem[] {
  return items.filter((item) => {
    if (!item.requiredAction) {
      return true;
    }
    return can(role, item.requiredAction);
  });
}
