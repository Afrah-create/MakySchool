import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import {
  TENANT_ACCESS_COOKIE,
  TENANT_REFRESH_COOKIE,
} from "@makyschool/shared/constants";
import type { TenantJwtPayload } from "@makyschool/shared/types";

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

export async function getTenantPayloadFromCookies(): Promise<TenantJwtPayload | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(TENANT_ACCESS_COOKIE)?.value;
  if (accessToken) {
    const payload = await verifyToken(accessToken);
    if (payload) {
      return payload;
    }
  }

  const refreshToken = cookieStore.get(TENANT_REFRESH_COOKIE)?.value;
  if (refreshToken) {
    return verifyToken(refreshToken);
  }

  return null;
}
