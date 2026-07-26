"use client";

import { useMemo } from "react";
import { LayoutDashboard } from "lucide-react";
import type { UserRole } from "@makyschool/shared/types";
import { MobileAppChrome } from "@/components/layout/mobile/MobileAppChrome";
import type { GroupedNavGroup, GroupedNavItem } from "@/components/layout/shared/GroupedSidebarNav";
import { getSchoolAdminMobileTabs } from "@/lib/roles/mobile-tab-configs";
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

export function SchoolAdminMobileChrome({
  schoolName,
  role,
  setupMode = false,
  billingEnabled = true,
}: {
  schoolName?: string | null;
  role: UserRole;
  setupMode?: boolean;
  billingEnabled?: boolean;
}) {
  const tabs = useMemo(() => getSchoolAdminMobileTabs(role), [role]);
  const navGroups = useMemo(() => {
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

  return <MobileAppChrome schoolName={schoolName} tabs={tabs} navGroups={navGroups} />;
}
