import {
  TENANT_ACCESS_COOKIE,
  TENANT_HEADERS,
  TENANT_REFRESH_COOKIE,
} from "@makyschool/shared/constants";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getTenantPayloadFromRequest } from "@/lib/auth/verify-tenant-token";
import { extractSchoolSlug } from "@/lib/tenant/extract-school-slug";

const SETUP_PATH = "/dashboard/setup";

function clearTenantCookies(response: NextResponse) {
  response.cookies.delete(TENANT_ACCESS_COOKIE);
  response.cookies.delete(TENANT_REFRESH_COOKIE);
}

function platformAppUrl() {
  return (
    process.env.NEXT_PUBLIC_PLATFORM_APP_URL ??
    process.env.PLATFORM_APP_URL ??
    "http://localhost:3001"
  ).replace(/\/$/, "");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/register" || pathname === "/superadmin/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname.startsWith("/superadmin")) {
    return NextResponse.redirect(new URL(`${platformAppUrl()}${pathname.replace("/superadmin", "") || "/dashboard"}`, request.url));
  }

  const hasTenantSession =
    request.cookies.get(TENANT_ACCESS_COOKIE) ?? request.cookies.get(TENANT_REFRESH_COOKIE);

  const tenantPayload = hasTenantSession ? await getTenantPayloadFromRequest(request) : null;

  const isTenantProtected =
    pathname.startsWith("/dashboard") || pathname.startsWith("/auth/change-password");

  if (isTenantProtected) {
    if (!hasTenantSession) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    if (!tenantPayload) {
      const response = NextResponse.redirect(new URL("/login", request.url));
      clearTenantCookies(response);
      return response;
    }
  }

  if (tenantPayload) {
    const mustChangePassword = Boolean(tenantPayload.mustChangePassword);
    const setupCompleted = Boolean(tenantPayload.setupCompleted);

    if (mustChangePassword && pathname !== "/auth/change-password") {
      return NextResponse.redirect(new URL("/auth/change-password", request.url));
    }

    if (
      !mustChangePassword &&
      !setupCompleted &&
      pathname.startsWith("/dashboard") &&
      pathname !== SETUP_PATH
    ) {
      return NextResponse.redirect(new URL(SETUP_PATH, request.url));
    }

    if (!mustChangePassword && setupCompleted && pathname === SETUP_PATH) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  if (pathname === "/login" && tenantPayload) {
    if (tenantPayload.mustChangePassword) {
      return NextResponse.redirect(new URL("/auth/change-password", request.url));
    }
    if (!tenantPayload.setupCompleted) {
      return NextResponse.redirect(new URL(SETUP_PATH, request.url));
    }
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const host = request.headers.get("host") ?? "";
  const hostSchoolSlug = extractSchoolSlug(host);
  const resolvedSchoolSlug = hostSchoolSlug ?? tenantPayload?.schoolSlug ?? null;

  const requestHeaders = new Headers(request.headers);

  if (resolvedSchoolSlug) {
    requestHeaders.set(TENANT_HEADERS.SCHOOL_SLUG, resolvedSchoolSlug);
  } else {
    requestHeaders.delete(TENANT_HEADERS.SCHOOL_SLUG);
    requestHeaders.delete(TENANT_HEADERS.SCHOOL_ID);
  }

  if (tenantPayload?.schoolId) {
    requestHeaders.set(TENANT_HEADERS.SCHOOL_ID, tenantPayload.schoolId);
  }

  if (pathname === SETUP_PATH || pathname.startsWith(`${SETUP_PATH}/`)) {
    requestHeaders.set("x-makyschool-setup", "1");
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
