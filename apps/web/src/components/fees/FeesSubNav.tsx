"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@makyschool/ui/lib/cn";

const adminTabs = [
  { href: "/dashboard/fees", label: "Overview", exact: true },
  { href: "/dashboard/fees/structures", label: "Fee structures", exact: false },
  { href: "/dashboard/fees/payments", label: "Payment history", exact: false },
] as const;

function isActive(pathname: string, href: string, exact: boolean) {
  if (exact) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function FeesSubNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Fees sections"
      className="flex gap-1 overflow-x-auto rounded-xl border border-theme bg-input p-1"
    >
      {adminTabs.map((tab) => {
        const active = isActive(pathname, tab.href, tab.exact);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "inline-flex shrink-0 items-center rounded-lg px-4 py-2 text-sm font-medium transition",
              active
                ? "bg-theme-surface text-theme-primary shadow-theme-card"
                : "text-theme-muted hover:bg-nav-hover hover:text-theme-primary",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
