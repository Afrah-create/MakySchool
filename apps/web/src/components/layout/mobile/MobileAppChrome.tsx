"use client";

import { usePathname } from "next/navigation";
import type { MobileTab } from "@/lib/roles/mobile-tabs";
import type { GroupedNavGroup } from "@/components/layout/shared/GroupedSidebarNav";
import { MobileBottomNav } from "@/components/layout/mobile/MobileBottomNav";
import { MobileChildNavStrip } from "@/components/layout/mobile/MobileChildNavStrip";
import { MobileTopBar } from "@/components/layout/mobile/MobileTopBar";

export function MobileAppChrome({
  schoolName,
  tabs,
  navGroups = [],
}: {
  schoolName?: string | null;
  tabs: MobileTab[];
  /** Sidebar nav groups — used to render a horizontal child-nav strip on nested sections. */
  navGroups?: GroupedNavGroup[];
}) {
  const pathname = usePathname();

  return (
    <>
      <div className="border-b border-theme bg-sidebar/95 backdrop-blur-md">
        <MobileTopBar schoolName={schoolName} pathname={pathname} />
        {navGroups.length > 0 ? <MobileChildNavStrip groups={navGroups} /> : null}
      </div>
      <MobileBottomNav tabs={tabs} />
    </>
  );
}
