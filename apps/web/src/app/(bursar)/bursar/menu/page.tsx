"use client";

import { useMemo } from "react";
import { CircleDollarSign } from "lucide-react";
import { useCurrentRole } from "@/hooks/useCurrentRole";
import { MobileMenuContent } from "@/components/layout/mobile/MobileMenuContent";
import {
  filterPortalNavGroupsByRole,
  portalGroupsToGrouped,
} from "@/lib/roles/portal-nav";
import { bursarNavGroups } from "@/lib/roles/bursar-nav";
import type { GroupedNavGroup } from "@/components/layout/shared/GroupedSidebarNav";

export default function BursarMenuPage() {
  const role = useCurrentRole();

  const groups = useMemo((): GroupedNavGroup[] => {
    if (!role) {
      return [];
    }

    const all = portalGroupsToGrouped(filterPortalNavGroupsByRole(bursarNavGroups, role));
    const finance = all.find((group) => group.id === "finance");

    if (!finance) {
      return [];
    }

    return [
      {
        id: "shortcuts",
        label: "Quick links",
        icon: CircleDollarSign,
        items: finance.items.flatMap((item) => item.children ?? [item]),
      },
    ];
  }, [role]);

  return (
    <div className="lg:hidden">
      <p className="mb-4 text-sm text-theme-muted">
        All finance tools in one place.
      </p>
      <MobileMenuContent groups={groups} />
    </div>
  );
}
