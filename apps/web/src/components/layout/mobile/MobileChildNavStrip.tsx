"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  findActiveSectionChildNav,
  isGroupedNavItemActive,
  type GroupedNavGroup,
  type GroupedNavItem,
} from "@/components/layout/shared/GroupedSidebarNav";

function bestMatchingChild(
  pathname: string,
  children: GroupedNavItem[],
): GroupedNavItem | null {
  const matches = children.filter((child) => isGroupedNavItemActive(pathname, child));
  if (matches.length === 0) return null;
  return matches.reduce((best, item) => (item.href.length > best.href.length ? item : best));
}

export function MobileChildNavStrip({ groups }: { groups: GroupedNavGroup[] }) {
  const pathname = usePathname();
  const children = findActiveSectionChildNav(pathname, groups);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeHref = children ? bestMatchingChild(pathname, children)?.href : null;

  useEffect(() => {
    if (!activeHref || !scrollerRef.current) return;
    const activeEl = scrollerRef.current.querySelector<HTMLElement>(
      `[data-nav-href="${activeHref.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`,
    );
    activeEl?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeHref, pathname]);

  if (!children?.length) return null;

  return (
    <nav
      aria-label="Section navigation"
      className="border-t border-theme/70"
    >
      <div
        ref={scrollerRef}
        className="flex gap-1.5 overflow-x-auto overscroll-x-contain px-3 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children.map((item) => {
          const active = item.href === activeHref;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-nav-href={item.href}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition ${
                active
                  ? "bg-theme-accent text-on-accent shadow-theme-accent"
                  : "bg-theme-surface-raised text-theme-muted hover:bg-nav-hover hover:text-theme-primary"
              }`}
            >
              {Icon ? <Icon className="h-3.5 w-3.5" strokeWidth={active ? 2.25 : 2} /> : null}
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
