import { can, type PermissionAction } from "@makyschool/shared/constants";
import type { MakySchoolRole } from "@makyschool/shared/types";
import { useAuth } from "@/hooks/useAuth";
import { usePortalRole } from "@/providers/PortalRoleProvider";

/** Server-verified portal role takes precedence over client /auth/me hydration. */
export function useCurrentRole(): MakySchoolRole | undefined {
  const portalRole = usePortalRole();
  const { state } = useAuth();
  return portalRole ?? state.user?.role;
}

export function useCan(action: PermissionAction): boolean {
  const role = useCurrentRole();
  return role ? can(role, action) : false;
}
