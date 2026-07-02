"use client";

import { useMemo } from "react";
import type { UserRole } from "@makyschool/shared/types";
import { MobileAppChrome } from "@/components/layout/mobile/MobileAppChrome";
import { getSchoolAdminMobileTabs } from "@/lib/roles/mobile-tab-configs";

export function SchoolAdminMobileChrome({
  schoolName,
  role,
}: {
  schoolName?: string | null;
  role: UserRole;
}) {
  const tabs = useMemo(() => getSchoolAdminMobileTabs(role), [role]);

  return <MobileAppChrome schoolName={schoolName} tabs={tabs} />;
}
