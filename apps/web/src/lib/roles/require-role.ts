import { redirect } from "next/navigation";
import type { TenantJwtPayload } from "@makyschool/shared/types";
import {
  homePathForPortal,
  portalForRole,
  roleHasPortalAccess,
  type Portal,
} from "./portals";

export function requirePortalSession(
  session: TenantJwtPayload | null,
  portal: Portal,
): asserts session is TenantJwtPayload {
  if (!session) {
    redirect("/login");
  }

  if (!roleHasPortalAccess(session.role, portal)) {
    redirect(homePathForPortal(portalForRole(session.role)));
  }
}
