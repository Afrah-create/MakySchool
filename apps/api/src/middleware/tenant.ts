import { TENANT_HEADERS } from "@makyschool/shared/constants";
import type { NextFunction, Request, Response } from "express";

export interface TenantRequest extends Request {
  schoolSlug?: string;
  schoolId?: string;
}

/**
 * Resolves tenant from headers injected by Caddy / Next.js middleware.
 * school_id lookup against PostgreSQL will be added in the multi-tenant task.
 */
export function tenantMiddleware(
  req: TenantRequest,
  res: Response,
  next: NextFunction,
) {
  const schoolSlug = req.header(TENANT_HEADERS.SCHOOL_SLUG);
  const schoolId = req.header(TENANT_HEADERS.SCHOOL_ID);

  if (!schoolSlug && req.path.startsWith("/api/v1/tenants")) {
    return next();
  }

  if (!schoolSlug && !req.path.startsWith("/api/v1/health")) {
    return res.status(400).json({
      error: "Missing tenant context. Access the API via a school subdomain.",
    });
  }

  req.schoolSlug = schoolSlug ?? undefined;
  req.schoolId = schoolId ?? undefined;
  next();
}
