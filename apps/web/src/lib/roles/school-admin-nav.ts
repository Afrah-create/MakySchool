import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  Archive,
  Award,
  BookOpenCheck,
  Building2,
  Feather,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Hash,
  History,
  Landmark,
  Layers,
  LayoutDashboard,
  Library,
  ListOrdered,
  MapPin,
  PieChart,
  Receipt,
  RefreshCw,
  Settings2,
  Shield,
  ShieldCheck,
  Sigma,
  UserRound,
  UsersRound,
  Wallet,
} from "lucide-react";
import { can, schoolOffersALevel, schoolOffersOLevel, schoolOffersPrimary, type PermissionAction } from "@makyschool/shared/constants";
import type { SchoolType, UserRole } from "@makyschool/shared/types";

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
  { href: "/dashboard/fees", label: "Overview", icon: LayoutDashboard, exact: true, requiredAction: null },
  { href: "/dashboard/fees/structures", label: "Fee structures", icon: ListOrdered, exact: false, requiredAction: null },
  { href: "/dashboard/fees/payments", label: "Payment history", icon: History, exact: false, requiredAction: null },
  { href: "/dashboard/fees/outstanding", label: "Outstanding", icon: AlertCircle, exact: false, requiredAction: "viewFees" },
  { href: "/dashboard/fees/invoices", label: "Invoices", icon: Receipt, exact: false, requiredAction: "viewInvoices" },
  { href: "/dashboard/fees/other-income", label: "Other income", icon: Wallet, exact: false, requiredAction: "viewFees" },
  { href: "/dashboard/fees/budget", label: "Budget", icon: PieChart, exact: false, requiredAction: "viewBudget" },
  { href: "/dashboard/fees/reports", label: "Reports", icon: FileText, exact: false, requiredAction: "viewReports" },
];

const schoolAdminALevelNavChildren: NavItem[] = [
  { href: "/dashboard/alevel/exams", label: "Exams", icon: ClipboardList, exact: false, requiredAction: "viewALevel" },
  { href: "/dashboard/alevel/grades", label: "View grades", icon: BookOpenCheck, exact: false, requiredAction: "viewALevel" },
  { href: "/dashboard/alevel/results", label: "Results", icon: Award, exact: false, requiredAction: "viewALevel" },
  { href: "/dashboard/alevel/report-cards", label: "Report cards", icon: FileText, exact: false, requiredAction: "viewALevel" },
  { href: "/dashboard/alevel/setup/subjects", label: "Subjects", icon: Layers, exact: false, requiredAction: "manageALevel" },
  { href: "/dashboard/alevel/setup/combinations", label: "Combinations", icon: Sigma, exact: false, requiredAction: "manageALevel" },
  { href: "/dashboard/alevel/setup/enrollments", label: "Enrollments", icon: UsersRound, exact: false, requiredAction: "manageALevel" },
  { href: "/dashboard/alevel/setup/exam-types", label: "Exam types", icon: ListOrdered, exact: false, requiredAction: "manageALevel" },
  { href: "/dashboard/alevel/setup/grading", label: "Grading scale", icon: ListOrdered, exact: false, requiredAction: "manageALevel" },
];

const schoolAdminPrimaryNavChildren: NavItem[] = [
  { href: "/dashboard/primary", label: "Overview", icon: LayoutDashboard, exact: true, requiredAction: "viewPrimaryResults" },
  { href: "/dashboard/primary/exams", label: "Exams", icon: ClipboardList, exact: false, requiredAction: "viewPrimaryResults" },
  { href: "/dashboard/primary/sittings", label: "Thematic sittings", icon: ClipboardList, exact: false, requiredAction: "viewPrimaryResults" },
  { href: "/dashboard/primary/grades", label: "View grades", icon: BookOpenCheck, exact: false, requiredAction: "viewPrimaryResults" },
  { href: "/dashboard/primary/results", label: "Results", icon: Award, exact: false, requiredAction: "viewPrimaryResults" },
  { href: "/dashboard/primary/report-cards", label: "Report cards", icon: FileText, exact: false, requiredAction: "generatePrimaryReports" },
  { href: "/dashboard/primary/ple", label: "PLE", icon: GraduationCap, exact: false, requiredAction: "managePLEResults" },
  { href: "/dashboard/primary/exam-types", label: "Exam types", icon: ListOrdered, exact: false, requiredAction: "managePrimarySetup" },
  { href: "/dashboard/primary/setup", label: "Setup", icon: Settings2, exact: false, requiredAction: "managePrimarySetup" },
];

const schoolAdminOLevelNavChildren: NavItem[] = [
  { href: "/dashboard/olevel", label: "Overview", icon: LayoutDashboard, exact: true, requiredAction: "viewCurriculum" },
  { href: "/dashboard/olevel/exam-sessions", label: "Exam sessions", icon: ClipboardList, exact: false, requiredAction: "viewCurriculum" },
  { href: "/dashboard/olevel/students", label: "Students", icon: UsersRound, exact: false, requiredAction: "manageStudentSubjects" },
  { href: "/dashboard/olevel/results", label: "Results", icon: Award, exact: false, requiredAction: "viewOLevelResults" },
  { href: "/dashboard/olevel/marks", label: "Marks review", icon: BookOpenCheck, exact: false, requiredAction: "viewOLevelResults" },
  { href: "/dashboard/olevel/setup", label: "Setup", icon: Settings2, exact: false, requiredAction: "manageCurriculum" },
];

const schoolAdminSettingsNavChildren: NavItem[] = [
  { href: "/dashboard/settings", label: "Profile", icon: Building2, exact: true, requiredAction: "manageSchool" },
  { href: "/dashboard/settings/academic", label: "Academic year", icon: CalendarDays, exact: false, requiredAction: "manageSchool" },
  {
    href: "/dashboard/settings/year-rollover",
    label: "Year rollover",
    icon: RefreshCw,
    exact: false,
    requiredAction: "manageAcademicYear",
  },
  {
    href: "/dashboard/settings/data-retention",
    label: "Data retention",
    icon: Archive,
    exact: false,
    requiredAction: "manageAcademicYear",
  },
  { href: "/dashboard/settings/grading", label: "Grading scale", icon: ListOrdered, exact: false, requiredAction: "manageSchool" },
  { href: "/dashboard/settings/students", label: "Student IDs", icon: Hash, exact: false, requiredAction: "manageSchool" },
  {
    href: "/dashboard/settings/teacher-attendance",
    label: "Teacher attendance",
    icon: MapPin,
    exact: false,
    requiredAction: "manageAttendanceSettings",
  },
  { href: "/dashboard/settings/accounts", label: "Chart of accounts", icon: Landmark, exact: false, requiredAction: "viewAccounts" },
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
      {
        href: "/dashboard/archive",
        label: "Historical records",
        icon: Archive,
        exact: false,
        requiredAction: "viewAnalytics",
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
      {
        href: "/dashboard/attendance",
        label: "Attendance Registry",
        icon: ClipboardCheck,
        exact: true,
        requiredAction: "viewAllClasses",
      },
      {
        href: "/dashboard/teacher-attendance",
        label: "Teacher Attendance",
        icon: MapPin,
        exact: false,
        requiredAction: "viewTeacherAttendance",
      },
      {
        href: "/dashboard/discipline",
        label: "Discipline",
        icon: Shield,
        exact: false,
        requiredAction: "viewAllClasses",
      },
      {
        href: "/dashboard/theology",
        label: "Theology",
        icon: Feather,
        exact: false,
        requiredAction: "viewAllClasses",
      },
      {
        href: "/dashboard/teaching-plans",
        label: "Teaching plans",
        icon: FileText,
        exact: false,
        requiredAction: "viewAllClasses",
      },
      {
        href: "/dashboard/primary",
        label: "Primary",
        icon: BookOpenCheck,
        exact: false,
        requiredAction: "viewPrimaryResults",
        children: schoolAdminPrimaryNavChildren,
      },
      {
        href: "/dashboard/alevel/exams",
        label: "A-Level",
        icon: GraduationCap,
        exact: false,
        requiredAction: "viewALevel",
        children: schoolAdminALevelNavChildren,
      },
      {
        href: "/dashboard/olevel",
        label: "O-Level",
        icon: BookOpenCheck,
        exact: false,
        requiredAction: "viewCurriculum",
        children: schoolAdminOLevelNavChildren,
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
        requiredAction: null,
        children: schoolAdminSettingsNavChildren,
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

/** Hide Primary / A-Level when school_type does not offer that programme. */
export function filterNavGroupsBySchoolType(
  groups: NavGroup[],
  schoolType: SchoolType | string | null | undefined,
  theologyEnabled?: boolean,
): NavGroup[] {
  const offersPrimary = schoolOffersPrimary(schoolType);
  const offersALevel = schoolOffersALevel(schoolType);
  const offersOLevel = schoolOffersOLevel(schoolType);
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.href === "/dashboard/primary" || item.href.startsWith("/dashboard/primary/")) {
          return offersPrimary;
        }
        if (item.href.startsWith("/dashboard/alevel")) {
          return offersALevel;
        }
        if (item.href === "/dashboard/olevel" || item.href.startsWith("/dashboard/olevel/")) {
          return offersOLevel;
        }
        if (item.href === "/dashboard/theology" || item.href.startsWith("/dashboard/theology/")) {
          return Boolean(theologyEnabled);
        }
        return true;
      }),
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