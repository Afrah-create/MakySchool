"use client";

import { createContext, useContext } from "react";
import type { MakySchoolRole } from "@makyschool/shared/types";

const PortalRoleContext = createContext<MakySchoolRole | null>(null);

export function PortalRoleProvider({
  role,
  children,
}: {
  role: MakySchoolRole;
  children: React.ReactNode;
}) {
  return <PortalRoleContext.Provider value={role}>{children}</PortalRoleContext.Provider>;
}

export function usePortalRole() {
  return useContext(PortalRoleContext);
}
