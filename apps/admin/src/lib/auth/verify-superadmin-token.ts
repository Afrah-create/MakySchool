import {
  SUPERADMIN_ACCESS_COOKIE,
  SUPERADMIN_REFRESH_COOKIE,
} from "@makyschool/shared/constants";
import type { SuperAdminJwtPayload } from "@makyschool/shared/types";
import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";

const SUPERADMIN_SECRET = new TextEncoder().encode(
  process.env.SUPERADMIN_JWT_SECRET ?? "dev-superadmin-secret",
);

export async function getSuperAdminPayloadFromRequest(
  request: NextRequest,
): Promise<SuperAdminJwtPayload | null> {
  const token =
    request.cookies.get(SUPERADMIN_ACCESS_COOKIE)?.value ??
    request.cookies.get(SUPERADMIN_REFRESH_COOKIE)?.value;

  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, SUPERADMIN_SECRET);
    return payload as unknown as SuperAdminJwtPayload;
  } catch {
    return null;
  }
}
