import type { LucideIcon } from "lucide-react";

export type MobileTab = {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
  /** When true, only `href` matches exactly (not child paths). */
  exact?: boolean;
  /** Prefixes that activate this tab. Defaults to `[href]`. */
  matchPrefixes?: string[];
  /** When set, these prefixes never activate this tab. */
  excludePrefixes?: string[];
};

export function isMobileTabActive(pathname: string, tab: MobileTab): boolean {
  for (const excluded of tab.excludePrefixes ?? []) {
    if (pathname === excluded || pathname.startsWith(`${excluded}/`)) {
      return false;
    }
  }

  const prefixes = tab.matchPrefixes ?? [tab.href];

  if (tab.exact) {
    return prefixes.some((prefix) => pathname === prefix);
  }

  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function findActiveMobileTabId(pathname: string, tabs: MobileTab[]): string | null {
  for (const tab of tabs) {
    if (isMobileTabActive(pathname, tab)) {
      return tab.id;
    }
  }
  return null;
}
