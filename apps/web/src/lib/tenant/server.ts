import { TENANT_HEADERS } from "@makyschool/shared/constants";
import type { TenantContext } from "@makyschool/shared/types";

type HeaderLike = Pick<Headers, "get">;

export function getTenantFromHeaders(headers: HeaderLike): TenantContext | null {
  const schoolSlug = headers.get(TENANT_HEADERS.SCHOOL_SLUG);
  if (!schoolSlug) {
    return null;
  }

  const schoolId = headers.get(TENANT_HEADERS.SCHOOL_ID) ?? undefined;

  return { schoolSlug, schoolId };
}
