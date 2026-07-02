"use client";

import { useMemo } from "react";
import { Settings2 } from "lucide-react";
import { subscriptionsEnabled } from "@makyschool/shared/constants";
import { useCurrentRole } from "@/hooks/useCurrentRole";
import { MobileMenuContent } from "@/components/layout/mobile/MobileMenuContent";
import type { GroupedNavGroup, GroupedNavItem } from "@/components/layout/shared/GroupedSidebarNav";
import {
  filterNavGroupsByRole,
  schoolAdminNavGroups,
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

export default function SchoolAdminMenuPage() {
  const role = useCurrentRole();
  const billingEnabled = subscriptionsEnabled();

  const groups = useMemo(() => {
    if (!role) {
      return [];
    }

    const filtered = filterNavGroupsByRole(schoolAdminNavGroups, role)
      .filter((group) => group.id === "school")
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => item.href !== "/dashboard/billing" || billingEnabled,
        ),
      }));

    if (filtered.length > 0) {
      return toGroupedGroups(filtered);
    }

    return toGroupedGroups([
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
    ]);
  }, [billingEnabled, role]);

  return (
    <div className="lg:hidden">
      <p className="mb-4 text-sm text-theme-muted">School settings and tools.</p>
      <MobileMenuContent groups={groups} />
    </div>
  );
}
