import { TENANT_HEADERS } from "@makyschool/shared/constants";
import type { TenantContext } from "@makyschool/shared/types";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { extractSchoolSlug } from "@/lib/tenant/extract-school-slug";

export function middleware(request: NextRequest) {
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

export type { TenantContext };
