import {
  SUPERADMIN_ACCESS_COOKIE,
  SUPERADMIN_REFRESH_COOKIE,
} from "@makyschool/shared/constants";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSuperAdminPayloadFromRequest } from "@/lib/auth/verify-superadmin-token";

const PROTECTED_PREFIXES = ["/dashboard", "/schools", "/settings", "/admins", "/subscriptions"];

function isProtectedRoute(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function clearSuperadminCookies(response: NextResponse) {
  response.cookies.delete(SUPERADMIN_ACCESS_COOKIE);
  response.cookies.delete(SUPERADMIN_REFRESH_COOKIE);
}

function applyNoCacheHeaders(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  response.headers.set("Pragma", "no-cache");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await getSuperAdminPayloadFromRequest(request);
  const protectedRoute = isProtectedRoute(pathname);

  if (protectedRoute) {
    if (!session) {
      const response = NextResponse.redirect(new URL("/login", request.url));
      clearSuperadminCookies(response);
      applyNoCacheHeaders(response);
      return response;
    }

    const response = NextResponse.next();
    applyNoCacheHeaders(response);
    return response;
  }

  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (pathname === "/" && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (pathname === "/" && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname === "/login" && !session) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/dashboard/:path*",
    "/schools/:path*",
    "/settings/:path*",
    "/admins/:path*",
    "/subscriptions/:path*",
  ],
};
