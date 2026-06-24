import type { NextFunction, Response } from "express";
import type { TenantJwtPayload } from "@makyschool/shared/types";
import type { TenantRequest } from "./tenant.js";
import { getCookie } from "../utils/http.js";
import {
  TENANT_ACCESS_COOKIE,
  TENANT_REFRESH_COOKIE,
  verifyTenantToken,
} from "../utils/auth.js";

export interface AuthenticatedTenantRequest extends TenantRequest {
  tenantUser?: TenantJwtPayload;
}

export function requireTenantAuth(
  req: AuthenticatedTenantRequest,
  res: Response,
  next: NextFunction,
) {
  const token =
    getCookie(req, TENANT_ACCESS_COOKIE) ?? getCookie(req, TENANT_REFRESH_COOKIE);

  if (!token) {
    return res.status(401).json({ error: "Not authenticated", code: "UNAUTHORIZED" });
  }

  try {
    const payload = verifyTenantToken(token);

    if (req.schoolId && payload.schoolId !== req.schoolId) {
      return res.status(403).json({ error: "Forbidden", code: "TENANT_MISMATCH" });
    }

    req.tenantUser = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Not authenticated", code: "UNAUTHORIZED" });
  }
}
