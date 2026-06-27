"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, type LucideIcon } from "lucide-react";

export type GroupedNavItem = {
  href: string;
  label: string;
  icon?: LucideIcon;
  exact: boolean;
  children?: GroupedNavItem[];
};

export type GroupedNavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: GroupedNavItem[];
};

export function isGroupedNavItemActive(pathname: string, item: GroupedNavItem): boolean {
  if (item.children?.length) {
    return item.children.some((child) => isGroupedNavItemActive(pathname, child));
  }
  if (item.exact) {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function findActiveGroupedNavGroupId(
  pathname: string,
  groups: GroupedNavGroup[],
): string | null {
  for (const group of groups) {
    for (const item of group.items) {
      if (isGroupedNavItemActive(pathname, item)) {
        return group.id;
      }
    }
  }
  return null;
}

export function flattenGroupedNavItems(items: GroupedNavItem[]): GroupedNavItem[] {
  return items.flatMap((item) => (item.children?.length ? item.children : [item]));
}

function readStoredSet(key: string): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function persistSet(key: string, values: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...values]));
  } catch {
    // ignore
  }
}

function NavLink({
  item,
  pathname,
  nested = false,
}: {
  item: GroupedNavItem;
  pathname: string;
  nested?: boolean;
}) {
  const Icon = item.icon;
  const active = isGroupedNavItemActive(pathname, item);

  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-theme-accent text-on-accent shadow-theme-accent"
          : "text-theme-muted hover:bg-nav-hover hover:text-theme-primary"
      } ${nested ? "text-[13px]" : ""}`}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.25 : 2} /> : null}
      {item.label}
    </Link>
  );
}

function NavExpandableItem({
  item,
  pathname,
  open,
  onToggle,
}: {
  item: GroupedNavItem;
  pathname: string;
  open: boolean;
  onToggle: () => void;
}) {
  const Icon = item.icon;
  const hasActiveChild = isGroupedNavItemActive(pathname, item);

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
          hasActiveChild
            ? "text-theme-primary"
            : "text-theme-muted hover:bg-nav-hover hover:text-theme-primary"
        }`}
      >
        {Icon ? <Icon className="h-4 w-4 shrink-0" strokeWidth={hasActiveChild ? 2.25 : 2} /> : null}
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && item.children?.length ? (
        <div className="ml-5 space-y-0.5 border-l border-theme pl-3">
          {item.children.map((child) => (
            <NavLink key={child.href} item={child} pathname={pathname} nested />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NavGroupSection({
  group,
  pathname,
  open,
  expandedItems,
  onToggleGroup,
  onToggleItem,
}: {
  group: GroupedNavGroup;
  pathname: string;
  open: boolean;
  expandedItems: Set<string>;
  onToggleGroup: () => void;
  onToggleItem: (href: string) => void;
}) {
  const GroupIcon = group.icon;
  const hasActiveChild = group.items.some((item) => isGroupedNavItemActive(pathname, item));

  if (group.items.length === 1) {
    const item = group.items[0];
    if (item.children?.length) {
      return (
        <NavExpandableItem
          item={item}
          pathname={pathname}
          open={expandedItems.has(item.href)}
          onToggle={() => onToggleItem(item.href)}
        />
      );
    }
    return <NavLink item={item} pathname={pathname} />;
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onToggleGroup}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
          hasActiveChild
            ? "text-theme-primary"
            : "text-theme-muted hover:bg-nav-hover hover:text-theme-primary"
        }`}
      >
        <GroupIcon className="h-4 w-4 shrink-0" strokeWidth={hasActiveChild ? 2.25 : 2} />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="ml-5 space-y-0.5 border-l border-theme pl-3">
          {group.items.map((item) =>
            item.children?.length ? (
              <NavExpandableItem
                key={item.href}
                item={item}
                pathname={pathname}
                open={expandedItems.has(item.href)}
                onToggle={() => onToggleItem(item.href)}
              />
            ) : (
              <NavLink key={item.href} item={item} pathname={pathname} nested />
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

export function GroupedSidebarNav({
  groups,
  storagePrefix,
  expandItemWhen,
}: {
  groups: GroupedNavGroup[];
  storagePrefix: string;
  /** Return hrefs of expandable items that should open for the current path. */
  expandItemWhen?: (pathname: string) => string[];
}) {
  const pathname = usePathname();
  const openGroupsKey = `${storagePrefix}-nav-open`;
  const expandedItemsKey = `${storagePrefix}-nav-expanded`;
  const activeGroupId = findActiveGroupedNavGroupId(pathname, groups);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setOpenGroups((current) => {
      const stored = readStoredSet(openGroupsKey);
      const next = new Set(current.size > 0 ? current : stored);
      if (activeGroupId) {
        next.add(activeGroupId);
      }
      return next;
    });
  }, [activeGroupId, openGroupsKey]);

  useEffect(() => {
    setExpandedItems((current) => {
      const stored = readStoredSet(expandedItemsKey);
      const next = new Set(current.size > 0 ? current : stored);
      for (const href of expandItemWhen?.(pathname) ?? []) {
        next.add(href);
      }
      return next;
    });
  }, [expandedItemsKey, expandItemWhen, pathname]);

  const toggleGroup = (groupId: string) => {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      persistSet(openGroupsKey, next);
      return next;
    });
  };

  const toggleItem = (href: string) => {
    setExpandedItems((current) => {
      const next = new Set(current);
      if (next.has(href)) {
        next.delete(href);
      } else {
        next.add(href);
      }
      persistSet(expandedItemsKey, next);
      return next;
    });
  };

  return (
    <nav className="dashboard-scroll min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-1 text-sm">
      {groups.map((group) => (
        <NavGroupSection
          key={group.id}
          group={group}
          pathname={pathname}
          open={openGroups.has(group.id)}
          expandedItems={expandedItems}
          onToggleGroup={() => toggleGroup(group.id)}
          onToggleItem={toggleItem}
        />
      ))}
    </nav>
  );
}

export function GroupedMobileNavLinks({
  groups,
}: {
  groups: GroupedNavGroup[];
}) {
  const pathname = usePathname();
  const items = flattenGroupedNavItems(groups.flatMap((group) => group.items));

  return (
    <nav className="flex gap-1 overflow-x-auto px-4 pb-3">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isGroupedNavItemActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition ${
              active
                ? "bg-theme-accent text-on-accent"
                : "text-theme-muted hover:bg-nav-hover hover:text-theme-primary"
            }`}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" strokeWidth={active ? 2.25 : 2} /> : null}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
