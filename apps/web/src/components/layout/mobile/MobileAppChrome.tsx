"use client";

import { usePathname } from "next/navigation";
import type { MobileTab } from "@/lib/roles/mobile-tabs";
import { MobileBottomNav } from "@/components/layout/mobile/MobileBottomNav";
import { MobileTopBar } from "@/components/layout/mobile/MobileTopBar";

export function MobileAppChrome({
  schoolName,
  tabs,
}: {
  schoolName?: string | null;
  tabs: MobileTab[];
}) {
  const pathname = usePathname();

  return (
    <>
      <MobileTopBar schoolName={schoolName} pathname={pathname} />
      <MobileBottomNav tabs={tabs} />
    </>
  );
}
