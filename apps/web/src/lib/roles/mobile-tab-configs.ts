import {
  BookOpen,
  CalendarDays,
  CircleDollarSign,
  LayoutDashboard,
  LayoutGrid,
  Library,
  User,
  UsersRound,
} from "lucide-react";
import { subscriptionsEnabled } from "@makyschool/shared/constants";
import type { UserRole } from "@makyschool/shared/types";
import type { MobileTab } from "./mobile-tabs";
import { filterNavGroupsByRole, schoolAdminNavGroups } from "./school-admin-nav";

export const teacherMobileTabs: MobileTab[] = [
  {
    id: "home",
    href: "/teacher/dashboard",
    label: "Home",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    id: "classes",
    href: "/teacher/classes",
    label: "Classes",
    icon: BookOpen,
    matchPrefixes: ["/teacher/classes"],
  },
  {
    id: "profile",
    href: "/teacher/profile",
    label: "Profile",
    icon: User,
    matchPrefixes: ["/teacher/profile"],
  },
];

export const learnerMobileTabs: MobileTab[] = [
  {
    id: "home",
    href: "/learner/dashboard",
    label: "Home",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    id: "timetable",
    href: "/learner/timetable",
    label: "Timetable",
    icon: CalendarDays,
    matchPrefixes: ["/learner/timetable"],
  },
];

export const bursarMobileTabs: MobileTab[] = [
  {
    id: "home",
    href: "/bursar/dashboard",
    label: "Home",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    id: "finance",
    href: "/bursar/payments/new",
    label: "Finance",
    icon: CircleDollarSign,
    matchPrefixes: ["/bursar"],
    excludePrefixes: ["/bursar/menu", "/bursar/dashboard"],
  },
  {
    id: "more",
    href: "/bursar/menu",
    label: "More",
    icon: LayoutGrid,
    matchPrefixes: ["/bursar/menu"],
    exact: true,
  },
];

export const schoolAdminMobileTabs: MobileTab[] = [
  {
    id: "home",
    href: "/dashboard",
    label: "Home",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    id: "people",
    href: "/dashboard/teachers",
    label: "People",
    icon: UsersRound,
    matchPrefixes: [
      "/dashboard/teachers",
      "/dashboard/students",
      "/dashboard/users",
      "/dashboard/teaching-load",
    ],
  },
  {
    id: "academic",
    href: "/dashboard/classes",
    label: "Academic",
    icon: Library,
    matchPrefixes: ["/dashboard/classes", "/dashboard/subjects", "/dashboard/timetable"],
  },
  {
    id: "finance",
    href: "/dashboard/fees",
    label: "Finance",
    icon: CircleDollarSign,
    matchPrefixes: ["/dashboard/fees", "/dashboard/billing"],
  },
  {
    id: "more",
    href: "/dashboard/menu",
    label: "More",
    icon: LayoutGrid,
    matchPrefixes: ["/dashboard/menu", "/dashboard/settings"],
  },
];

export function getTeacherMobileTabs(): MobileTab[] {
  return teacherMobileTabs;
}

export function getLearnerMobileTabs(): MobileTab[] {
  return learnerMobileTabs;
}

export function getBursarMobileTabs(): MobileTab[] {
  return bursarMobileTabs;
}

export function getSchoolAdminMobileTabs(role: UserRole): MobileTab[] {
  const billingEnabled = subscriptionsEnabled();
  const groups = filterNavGroupsByRole(schoolAdminNavGroups, role).map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => item.href !== "/dashboard/billing" || billingEnabled,
    ),
  }));

  const groupIds = new Set(groups.map((group) => group.id));

  return schoolAdminMobileTabs.filter((tab) => {
    if (tab.id === "home" || tab.id === "more") {
      return true;
    }
    if (tab.id === "people") {
      return groupIds.has("people");
    }
    if (tab.id === "academic") {
      return groupIds.has("academic");
    }
    if (tab.id === "finance") {
      return groupIds.has("finance");
    }
    return true;
  });
}

export function getPortalMobileTabs(portal: "teacher" | "bursar" | "learner"): MobileTab[] {
  switch (portal) {
    case "teacher":
      return getTeacherMobileTabs();
    case "learner":
      return getLearnerMobileTabs();
    case "bursar":
      return getBursarMobileTabs();
  }
}
