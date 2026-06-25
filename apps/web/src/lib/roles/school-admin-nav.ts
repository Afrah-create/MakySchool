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
  icon?: LucideIcon;
  exact: boolean;
  requiredAction: PermissionAction | null;
  /** Nested sidebar links (e.g. Fees sections). */
  children?: NavItem[];
};

const schoolAdminFeesNavChildren: NavItem[] = [
  { href: "/dashboard/fees", label: "Overview", exact: true, requiredAction: null },
  { href: "/dashboard/fees/structures", label: "Fee structures", exact: false, requiredAction: null },
  { href: "/dashboard/fees/payments", label: "Payment history", exact: false, requiredAction: null },
  { href: "/dashboard/fees/outstanding", label: "Outstanding", exact: false, requiredAction: "viewFees" },
  { href: "/dashboard/fees/invoices", label: "Invoices", exact: false, requiredAction: "viewInvoices" },
  { href: "/dashboard/fees/other-income", label: "Other income", exact: false, requiredAction: "viewFees" },
  { href: "/dashboard/fees/budget", label: "Budget", exact: false, requiredAction: "viewBudget" },
  { href: "/dashboard/fees/reports", label: "Reports", exact: false, requiredAction: "viewReports" },
];

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
        children: schoolAdminFeesNavChildren,
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

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (item.children?.length) {
    return item.children.some((child) => isNavItemActive(pathname, child));
  }
  if (item.exact) {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function filterNavByRole(items: NavItem[], role: UserRole): NavItem[] {
  return items
    .filter((item) => !item.requiredAction || can(role, item.requiredAction))
    .map((item) => ({
      ...item,
      children: item.children ? filterNavByRole(item.children, role) : undefined,
    }))
    .filter((item) => !item.children || item.children.length > 0);
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
      if (isNavItemActive(pathname, item)) {
        return group.id;
      }
    }
  }
  return null;
}

export function flattenNavItems(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => (item.children?.length ? item.children : [item]));
}
