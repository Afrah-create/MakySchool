"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MobileTab } from "@/lib/roles/mobile-tabs";
import { isMobileTabActive } from "@/lib/roles/mobile-tabs";

export function MobileBottomNav({ tabs }: { tabs: MobileTab[] }) {
  const pathname = usePathname();

  if (tabs.length === 0) {
    return null;
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-theme bg-sidebar/95 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Primary"
    >
      <div className="mx-auto flex h-[3.75rem] max-w-lg items-stretch justify-around px-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isMobileTabActive(pathname, tab);

          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 transition ${
                active
                  ? "text-theme-accent"
                  : "text-theme-muted hover:text-theme-primary"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon
                className="h-[1.35rem] w-[1.35rem] shrink-0"
                strokeWidth={active ? 2.25 : 1.75}
              />
              <span
                className={`max-w-full truncate text-[10px] leading-tight ${
                  active ? "font-semibold" : "font-medium"
                }`}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
