"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import {
  isGroupedNavItemActive,
  type GroupedNavGroup,
  type GroupedNavItem,
} from "@/components/layout/shared/GroupedSidebarNav";

function MenuLink({ item, pathname }: { item: GroupedNavItem; pathname: string }) {
  const Icon = item.icon;
  const active = isGroupedNavItemActive(pathname, item);

  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
        active
          ? "bg-theme-accent text-on-accent shadow-theme-accent"
          : "bg-theme-surface text-theme-primary hover:bg-nav-hover"
      }`}
    >
      {Icon ? (
        <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.25 : 2} />
      ) : null}
      <span className="min-w-0 flex-1">{item.label}</span>
      <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />
    </Link>
  );
}

function MenuGroup({
  group,
  pathname,
}: {
  group: GroupedNavGroup;
  pathname: string;
}) {
  const GroupIcon = group.icon;

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <GroupIcon className="h-4 w-4 text-theme-muted" strokeWidth={2} />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-theme-muted">
          {group.label}
        </h2>
      </div>
      <div className="space-y-1.5">
        {group.items.map((item) =>
          item.children?.length ? (
            item.children.map((child) => (
              <MenuLink key={child.href} item={child} pathname={pathname} />
            ))
          ) : (
            <MenuLink key={item.href} item={item} pathname={pathname} />
          ),
        )}
      </div>
    </section>
  );
}

export function MobileMenuContent({ groups }: { groups: GroupedNavGroup[] }) {
  const pathname = usePathname();

  return (
    <div className="space-y-6 pb-2">
      {groups.map((group) => (
        <MenuGroup key={group.id} group={group} pathname={pathname} />
      ))}
    </div>
  );
}
