import { jwtVerify } from "jose";
import { TENANT_ACCESS_COOKIE, TENANT_REFRESH_COOKIE } from "@makyschool/shared/constants";
import type { TenantJwtPayload } from "@makyschool/shared/types";
import type { NextRequest } from "next/server";

const TENANT_SECRET = new TextEncoder().encode(
  process.env.TENANT_JWT_SECRET ?? "dev-tenant-secret",
);

async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, TENANT_SECRET);
    return payload as unknown as TenantJwtPayload;
  } catch {
    return null;
  }
}

export async function getTenantPayloadFromRequest(
  request: NextRequest,
): Promise<TenantJwtPayload | null> {
  const accessToken = request.cookies.get(TENANT_ACCESS_COOKIE)?.value;
  if (accessToken) {
    const payload = await verifyToken(accessToken);
    if (payload) {
      return payload;
    }
  }

  const refreshToken = request.cookies.get(TENANT_REFRESH_COOKIE)?.value;
  if (refreshToken) {
    const payload = await verifyToken(refreshToken);
    if (payload) {
      return payload;
    }
  }

  return null;
}
