"use client";

import type { ReactNode } from "react";
import { can, type PermissionAction } from "@makyschool/shared/constants";
import type { MakySchoolRole } from "@makyschool/shared/types";
import { useCurrentRole } from "@/hooks/useCurrentRole";

export function CanDo({
  action,
  role: roleProp,
  children,
}: {
  action: PermissionAction;
  role?: MakySchoolRole;
  children: ReactNode;
}) {
  const currentRole = useCurrentRole();
  const role = roleProp ?? currentRole;

  if (!role || !can(role, action)) {
    return null;
  }

  return <>{children}</>;
}
