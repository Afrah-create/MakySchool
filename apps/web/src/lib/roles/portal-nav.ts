import type { LucideIcon } from "lucide-react";
import type { UserRole } from "@makyschool/shared/types";

export type PortalNavItem = {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
  exact: boolean;
  roles: readonly UserRole[];
};

export function filterPortalNavByRole(items: PortalNavItem[], role: UserRole): PortalNavItem[] {
  return items.filter((item) => item.roles.includes(role));
}
