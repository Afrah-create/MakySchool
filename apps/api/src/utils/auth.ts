import jwt, { type SignOptions } from "jsonwebtoken";
import {
  SUPERADMIN_ACCESS_COOKIE,
  SUPERADMIN_REFRESH_COOKIE,
  TENANT_ACCESS_COOKIE,
  TENANT_REFRESH_COOKIE,
} from "@makyschool/shared/constants";
import type { SuperAdminJwtPayload, TenantJwtPayload } from "@makyschool/shared/types";

export {
  SUPERADMIN_ACCESS_COOKIE,
  SUPERADMIN_REFRESH_COOKIE,
  TENANT_ACCESS_COOKIE,
  TENANT_REFRESH_COOKIE,
};

const SUPERADMIN_SECRET = process.env.SUPERADMIN_JWT_SECRET ?? "dev-superadmin-secret";
const TENANT_SECRET = process.env.TENANT_JWT_SECRET ?? "dev-tenant-secret";

export function signSuperAdminToken(payload: SuperAdminJwtPayload, expiresIn: SignOptions["expiresIn"]) {
  return jwt.sign(payload, SUPERADMIN_SECRET, { expiresIn });
}

export function verifySuperAdminToken(token: string) {
  return jwt.verify(token, SUPERADMIN_SECRET) as SuperAdminJwtPayload;
}

export function signTenantToken(payload: TenantJwtPayload, expiresIn: SignOptions["expiresIn"]) {
  return jwt.sign(payload, TENANT_SECRET, { expiresIn });
}

export function verifyTenantToken(token: string) {
  return jwt.verify(token, TENANT_SECRET) as TenantJwtPayload;
}

export function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeMs,
  };
}
