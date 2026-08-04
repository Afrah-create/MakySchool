"use client";

import { createContext, useContext } from "react";
import type { MakySchoolRole } from "@makyschool/shared/types";

const PortalRoleContext = createContext<MakySchoolRole | undefined>(undefined);

export function PortalRoleProvider({
  role,
  children,
}: {
  role: MakySchoolRole;
  children: React.ReactNode;
}) {
  return <PortalRoleContext.Provider value={role}>{children}</PortalRoleContext.Provider>;
}

/** Server-verified role for the current portal layout. Undefined outside a portal. */
export function usePortalRole(): MakySchoolRole | undefined {
  return useContext(PortalRoleContext);
}
