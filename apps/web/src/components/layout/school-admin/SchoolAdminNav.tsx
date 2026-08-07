"use client";

import { useMemo } from "react";
import { LayoutDashboard } from "lucide-react";
import type { UserRole } from "@makyschool/shared/types";
import {
  GroupedMobileNavLinks,
  GroupedSidebarNav,
  type GroupedNavGroup,
  type GroupedNavItem,
} from "@/components/layout/shared/GroupedSidebarNav";
import { isFeesPath } from "@/lib/roles/fees-nav";
import { isSettingsPath } from "@/lib/roles/settings-nav";
import {
  filterNavGroupsByRole,
  filterNavGroupsBySchoolType,
  schoolAdminNavGroups,
  schoolAdminSetupNav,
  type NavGroup,
  type NavItem,
} from "@/lib/roles/school-admin-nav";
import { useOptionalSchool } from "@/providers/SchoolProvider";

function toGroupedItem(item: NavItem): GroupedNavItem {
  return {
    href: item.href,
    label: item.label,
    icon: item.icon,
    exact: item.exact,
    children: item.children?.map(toGroupedItem),
  };
}

function toGroupedGroups(groups: NavGroup[]): GroupedNavGroup[] {
  return groups.map((group) => ({
    id: group.id,
    label: group.label,
    icon: group.icon,
    items: group.items.map(toGroupedItem),
  }));
}

function useFilteredAdminNavGroups(role: UserRole, billingEnabled: boolean) {
  const schoolCtx = useOptionalSchool();
  const schoolType = schoolCtx?.school?.school_type;
  const theologyEnabled = schoolCtx?.school?.theology_enabled;

  return useMemo(() => {
    return toGroupedGroups(
      filterNavGroupsBySchoolType(
        filterNavGroupsByRole(schoolAdminNavGroups, role),
        schoolType,
        theologyEnabled,
      )
        .filter((group) => {
          if (group.id !== "finance") return true;
          return group.items.some((item) => item.href !== "/dashboard/billing" || billingEnabled);
        })
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => item.href !== "/dashboard/billing" || billingEnabled),
        })),
    );
  }, [billingEnabled, role, schoolType, theologyEnabled]);
}

export function SchoolAdminSidebarNav({
  role,
  setupMode = false,
  billingEnabled = true,
}: {
  role: UserRole;
  setupMode?: boolean;
  billingEnabled?: boolean;
}) {
  const groups = useFilteredAdminNavGroups(role, billingEnabled);

  const setupGroups = useMemo(() => {
    if (!setupMode) return null;
    const setupItem = schoolAdminSetupNav[0];
    return toGroupedGroups([
      {
        id: "setup",
        label: "Setup",
        icon: setupItem.icon ?? LayoutDashboard,
        items: schoolAdminSetupNav,
      },
    ]);
  }, [setupMode]);

  return (
    <GroupedSidebarNav
      groups={setupGroups ?? groups}
      storagePrefix="school-admin"
      expandItemWhen={(pathname) => {
        const expanded: string[] = [];
        if (isFeesPath(pathname)) expanded.push("/dashboard/fees");
        if (isSettingsPath(pathname)) expanded.push("/dashboard/settings");
        if (pathname.startsWith("/dashboard/primary")) expanded.push("/dashboard/primary");
        if (pathname.startsWith("/dashboard/alevel")) expanded.push("/dashboard/alevel/exams");
        return expanded;
      }}
    />
  );
}

export function SchoolAdminMobileNavLinks({
  role,
  setupMode = false,
  billingEnabled = true,
}: {
  role: UserRole;
  setupMode?: boolean;
  billingEnabled?: boolean;
}) {
  const groups = useFilteredAdminNavGroups(role, billingEnabled);

  const setupGroups = useMemo(() => {
    if (!setupMode) return null;
    return toGroupedGroups([
      {
        id: "setup",
        label: "Setup",
        icon: schoolAdminSetupNav[0].icon ?? LayoutDashboard,
        items: schoolAdminSetupNav,
      },
    ]);
  }, [setupMode]);

  return <GroupedMobileNavLinks groups={setupGroups ?? groups} />;
}
