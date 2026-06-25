import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  GraduationCap,
  Landmark,
  Layers,
  LayoutDashboard,
  Library,
  Receipt,
  Settings2,
  ShieldCheck,
  UserRound,
  UsersRound,
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

export type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
};

export const schoolAdminNavGroups: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        exact: true,
        requiredAction: null,
      },
    ],
  },
  {
    id: "people",
    label: "People",
    icon: UsersRound,
    items: [
      {
        href: "/dashboard/teachers",
        label: "Teachers",
        icon: GraduationCap,
        exact: false,
        requiredAction: "viewAllStaff",
      },
      {
        href: "/dashboard/teaching-load",
        label: "Teaching load",
        icon: ClipboardList,
        exact: false,
        requiredAction: "manageStaff",
      },
      {
        href: "/dashboard/students",
        label: "Students",
        icon: UserRound,
        exact: false,
        requiredAction: "viewAllClasses",
      },
      {
        href: "/dashboard/users",
        label: "Staff accounts",
        icon: ShieldCheck,
        exact: false,
        requiredAction: "viewAllStaff",
      },
    ],
  },
  {
    id: "academic",
    label: "Academic",
    icon: Library,
    items: [
      {
        href: "/dashboard/classes",
        label: "Classes",
        icon: Library,
        exact: false,
        requiredAction: "viewAllClasses",
      },
      {
        href: "/dashboard/subjects",
        label: "Subjects",
        icon: Layers,
        exact: false,
        requiredAction: "viewAllClasses",
      },
      {
        href: "/dashboard/timetable",
        label: "Timetable",
        icon: CalendarDays,
        exact: false,
        requiredAction: "manageTimetable",
      },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: CircleDollarSign,
    items: [
      {
        href: "/dashboard/fees",
        label: "Fees",
        icon: Receipt,
        exact: false,
        requiredAction: "viewFees",
      },
      {
        href: "/dashboard/billing",
        label: "Billing",
        icon: Landmark,
        exact: false,
        requiredAction: "viewFinance",
      },
    ],
  },
  {
    id: "school",
    label: "School",
    icon: Settings2,
    items: [
      {
        href: "/dashboard/settings",
        label: "Settings",
        icon: Settings2,
        exact: false,
        requiredAction: "manageSchool",
      },
    ],
  },
];

/** @deprecated Use schoolAdminNavGroups — kept for type re-exports */
export const schoolAdminNav: NavItem[] = schoolAdminNavGroups.flatMap((group) => group.items);

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

export function filterNavGroupsByRole(groups: NavGroup[], role: UserRole): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: filterNavByRole(group.items, role),
    }))
    .filter((group) => group.items.length > 0);
}

export function findActiveNavGroupId(pathname: string, groups: NavGroup[]): string | null {
  for (const group of groups) {
    for (const item of group.items) {
      const active = item.exact
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (active) {
        return group.id;
      }
    }
  }
  return null;
}
