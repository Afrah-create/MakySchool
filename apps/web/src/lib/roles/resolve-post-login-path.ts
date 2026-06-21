import type { UserRole } from "@makyschool/shared/types";
import { homePathForPortal, isSchoolAdminRole, portalForRole } from "./portals";

type PostLoginOptions = {
  role: UserRole;
  mustChangePassword?: boolean;
  setupCompleted?: boolean;
};

export function resolvePostLoginPath({
  role,
  mustChangePassword,
  setupCompleted,
}: PostLoginOptions): string {
  if (mustChangePassword) {
    return "/auth/change-password";
  }

  if (isSchoolAdminRole(role) && !setupCompleted) {
    return "/dashboard/setup";
  }

  return homePathForPortal(portalForRole(role));
}
