import type { LucideIcon } from "lucide-react";
import type { UserRole } from "@makyschool/shared/types";
import type { GroupedNavGroup, GroupedNavItem } from "@/components/layout/shared/GroupedSidebarNav";

export type PortalNavItem = {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
  exact: boolean;
  roles: readonly UserRole[];
  children?: PortalNavItem[];
};

export type PortalNavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: PortalNavItem[];
};

export function filterPortalNavByRole(items: PortalNavItem[], role: UserRole): PortalNavItem[] {
  return items
    .filter((item) => item.roles.includes(role))
    .map((item) => ({
      ...item,
      children: item.children ? filterPortalNavByRole(item.children, role) : undefined,
    }))
    .filter((item) => !item.children || item.children.length > 0);
}

export function filterPortalNavGroupsByRole(groups: PortalNavGroup[], role: UserRole): PortalNavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: filterPortalNavByRole(group.items, role),
    }))
    .filter((group) => group.items.length > 0);
}

export function portalItemToGrouped(item: PortalNavItem): GroupedNavItem {
  return {
    href: item.href,
    label: item.label,
    icon: item.icon,
    exact: item.exact,
    children: item.children?.map(portalItemToGrouped),
  };
}

export function portalGroupsToGrouped(groups: PortalNavGroup[]): GroupedNavGroup[] {
  return groups.map((group) => ({
    id: group.id,
    label: group.label,
    icon: group.icon,
    items: group.items.map(portalItemToGrouped),
  }));
}
