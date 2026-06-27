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
import {
  filterNavGroupsByRole,
  schoolAdminNavGroups,
  schoolAdminSetupNav,
  type NavGroup,
  type NavItem,
} from "@/lib/roles/school-admin-nav";

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

export function SchoolAdminSidebarNav({
  role,
  setupMode = false,
  billingEnabled = true,
}: {
  role: UserRole;
  setupMode?: boolean;
  billingEnabled?: boolean;
}) {
  const groups = useMemo(() => {
    if (setupMode) {
      const setupItem = schoolAdminSetupNav[0];
      return toGroupedGroups([
        {
          id: "setup",
          label: "Setup",
          icon: setupItem.icon ?? LayoutDashboard,
          items: schoolAdminSetupNav,
        },
      ]);
    }

    return toGroupedGroups(
      filterNavGroupsByRole(schoolAdminNavGroups, role)
        .filter((group) => {
          if (group.id !== "finance") return true;
          return group.items.some((item) => item.href !== "/dashboard/billing" || billingEnabled);
        })
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => item.href !== "/dashboard/billing" || billingEnabled),
        })),
    );
  }, [billingEnabled, role, setupMode]);

  return (
    <GroupedSidebarNav
      groups={groups}
      storagePrefix="school-admin"
      expandItemWhen={(pathname) => (isFeesPath(pathname) ? ["/dashboard/fees"] : [])}
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
  const groups = useMemo(() => {
    if (setupMode) {
      return toGroupedGroups([
        {
          id: "setup",
          label: "Setup",
          icon: schoolAdminSetupNav[0].icon ?? LayoutDashboard,
          items: schoolAdminSetupNav,
        },
      ]);
    }

    return toGroupedGroups(
      filterNavGroupsByRole(schoolAdminNavGroups, role).map((group) => ({
        ...group,
        items: group.items.filter((item) => item.href !== "/dashboard/billing" || billingEnabled),
      })),
    );
  }, [billingEnabled, role, setupMode]);

  return <GroupedMobileNavLinks groups={groups} />;
}
