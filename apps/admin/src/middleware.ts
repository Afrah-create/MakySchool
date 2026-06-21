import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSuperAdminPayloadFromRequest } from "@/lib/auth/verify-superadmin-token";

const PROTECTED_PREFIXES = ["/dashboard", "/schools", "/settings", "/admins"];

function isProtectedRoute(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await getSuperAdminPayloadFromRequest(request);

  if (isProtectedRoute(pathname)) {
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
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
  ],
};
