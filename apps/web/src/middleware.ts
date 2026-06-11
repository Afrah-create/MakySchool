import { TENANT_HEADERS } from "@makyschool/shared/constants";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { extractSchoolSlug } from "@/lib/tenant/extract-school-slug";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/superadmin")) {
    if (pathname !== "/superadmin/login" && !request.cookies.get("superadmin_access_token")) {
      const url = request.nextUrl.clone();
      url.pathname = "/superadmin/login";
      return NextResponse.redirect(url);
    }
  }

  const isTenantProtected = pathname.startsWith("/dashboard");

  if (isTenantProtected || pathname === "/login") {
    const hasTenantToken = Boolean(request.cookies.get("tenant_access_token"));

    if (isTenantProtected && !hasTenantToken) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    if (pathname === "/login" && hasTenantToken) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
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
