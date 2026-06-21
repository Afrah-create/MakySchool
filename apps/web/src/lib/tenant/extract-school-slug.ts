import { DEFAULT_ROOT_DOMAIN } from "@makyschool/shared/constants";

const LOCALHOST_SUFFIXES = [".localhost", "localhost"];

/** Reserved subdomains that are not school tenants */
const RESERVED_SUBDOMAINS = new Set(["www", "api", "admin", "app", "myschool"]);

export function extractSchoolSlug(host: string): string | null {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";

  if (!hostname || hostname === "localhost") {
    return process.env.NODE_ENV === "development"
      ? (process.env.DEV_TENANT_SLUG ?? null)
      : null;
  }

  for (const suffix of LOCALHOST_SUFFIXES) {
    if (hostname === suffix.replace(/^\./, "")) {
      return process.env.DEV_TENANT_SLUG ?? null;
    }

    if (hostname.endsWith(suffix) && hostname !== suffix.replace(/^\./, "")) {
      const slug = hostname.slice(0, -suffix.length).replace(/\.$/, "");
      if (slug && !RESERVED_SUBDOMAINS.has(slug)) {
        return slug;
      }
    }
  }

  const rootDomain =
    process.env.NEXT_PUBLIC_ROOT_DOMAIN?.toLowerCase() ?? DEFAULT_ROOT_DOMAIN;

  if (hostname === rootDomain || hostname === `www.${rootDomain}`) {
    return null;
  }

  if (hostname.endsWith(`.${rootDomain}`)) {
    const slug = hostname.slice(0, -(rootDomain.length + 1));
    if (slug && !slug.includes(".") && !RESERVED_SUBDOMAINS.has(slug)) {
      return slug;
    }
  }

  return null;
}
