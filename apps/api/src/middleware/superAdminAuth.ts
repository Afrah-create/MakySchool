import type { NextFunction, Request, Response } from "express";
import type { SuperAdminJwtPayload } from "@makyschool/shared/types";
import { getCookie } from "../utils/http.js";
import {
  SUPERADMIN_ACCESS_COOKIE,
  SUPERADMIN_REFRESH_COOKIE,
  verifySuperAdminToken,
} from "../utils/auth.js";

export interface SuperAdminRequest extends Request {
  superAdmin?: SuperAdminJwtPayload;
}

export function requireSuperAdmin(
  req: SuperAdminRequest,
  res: Response,
  next: NextFunction,
) {
  const token =
    getCookie(req, SUPERADMIN_ACCESS_COOKIE) ??
    getCookie(req, SUPERADMIN_REFRESH_COOKIE);

  if (!token) {
    return res.status(401).json({ error: "Not authenticated", code: "UNAUTHORIZED" });
  }

  try {
    req.superAdmin = verifySuperAdminToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "Not authenticated", code: "UNAUTHORIZED" });
  }
}
