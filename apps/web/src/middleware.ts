import { TENANT_HEADERS } from "@makyschool/shared/constants";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { extractSchoolSlug } from "@/lib/tenant/extract-school-slug";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/register" || pathname === "/superadmin/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const hasSuperAdminSession =
    request.cookies.get("superadmin_access_token") ??
    request.cookies.get("superadmin_refresh_token");

  const hasTenantSession =
    request.cookies.get("tenant_access_token") ??
    request.cookies.get("tenant_refresh_token");

  if (pathname.startsWith("/superadmin")) {
    if (!hasSuperAdminSession) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  const isTenantProtected = pathname.startsWith("/dashboard");

  if (isTenantProtected && !hasTenantSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (pathname === "/login") {
    if (hasSuperAdminSession) {
      return NextResponse.redirect(new URL("/superadmin/dashboard", request.url));
    }

    if (hasTenantSession) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  const host = request.headers.get("host") ?? "";
  const schoolSlug = extractSchoolSlug(host);

  const requestHeaders = new Headers(request.headers);

  if (schoolSlug) {
    requestHeaders.set(TENANT_HEADERS.SCHOOL_SLUG, schoolSlug);
  } else {
    requestHeaders.delete(TENANT_HEADERS.SCHOOL_SLUG);
    requestHeaders.delete(TENANT_HEADERS.SCHOOL_ID);
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
