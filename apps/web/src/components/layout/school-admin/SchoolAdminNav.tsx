"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, LayoutDashboard } from "lucide-react";
import type { UserRole } from "@makyschool/shared/types";
import { isFeesPath } from "@/lib/roles/fees-nav";
import {
  filterNavGroupsByRole,
  findActiveNavGroupId,
  flattenNavItems,
  isNavItemActive,
  schoolAdminNavGroups,
  schoolAdminSetupNav,
  type NavGroup,
  type NavItem,
} from "@/lib/roles/school-admin-nav";

const NAV_OPEN_STORAGE_KEY = "makyschool-school-admin-nav-open";
const NAV_EXPANDED_ITEMS_KEY = "makyschool-school-admin-nav-expanded";

function readStoredOpenGroups(): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }
  try {
    const raw = localStorage.getItem(NAV_OPEN_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function readStoredExpandedItems(): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }
  try {
    const raw = localStorage.getItem(NAV_EXPANDED_ITEMS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function persistOpenGroups(openGroups: Set<string>) {
  try {
    localStorage.setItem(NAV_OPEN_STORAGE_KEY, JSON.stringify([...openGroups]));
  } catch {
    // ignore
  }
}

function persistExpandedItems(expandedItems: Set<string>) {
  try {
    localStorage.setItem(NAV_EXPANDED_ITEMS_KEY, JSON.stringify([...expandedItems]));
  } catch {
    // ignore
  }
}

function NavLink({ item, pathname, nested = false }: { item: NavItem; pathname: string; nested?: boolean }) {
  const Icon = item.icon;
  const active = isNavItemActive(pathname, item);

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
  item: NavItem;
  pathname: string;
  open: boolean;
  onToggle: () => void;
}) {
  const Icon = item.icon;
  const hasActiveChild = isNavItemActive(pathname, item);

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
        <div className="space-y-0.5 border-l border-theme pl-3 ml-5">
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
  group: NavGroup;
  pathname: string;
  open: boolean;
  expandedItems: Set<string>;
  onToggleGroup: () => void;
  onToggleItem: (href: string) => void;
}) {
  const GroupIcon = group.icon;
  const hasActiveChild = group.items.some((item) => isNavItemActive(pathname, item));

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
        <div className="space-y-0.5 border-l border-theme pl-3 ml-5">
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

export function SchoolAdminSidebarNav({
  role,
  setupMode = false,
  billingEnabled = true,
}: {
  role: UserRole;
  setupMode?: boolean;
  billingEnabled?: boolean;
}) {
  const pathname = usePathname();
  const groups = useMemo(() => {
    if (setupMode) {
      const setupItem = schoolAdminSetupNav[0];
      return [
        {
          id: "setup",
          label: "Setup",
          icon: setupItem.icon ?? LayoutDashboard,
          items: schoolAdminSetupNav,
        } satisfies NavGroup,
      ];
    }

    return filterNavGroupsByRole(schoolAdminNavGroups, role)
      .filter((group) => {
        if (group.id !== "finance") return true;
        return group.items.some((item) => item.href !== "/dashboard/billing" || billingEnabled);
      })
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.href !== "/dashboard/billing" || billingEnabled),
      }));
  }, [billingEnabled, role, setupMode]);

  const activeGroupId = findActiveNavGroupId(pathname, groups);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setOpenGroups((current) => {
      const stored = readStoredOpenGroups();
      const next = new Set(current.size > 0 ? current : stored);
      if (activeGroupId) {
        next.add(activeGroupId);
      }
      return next;
    });
  }, [activeGroupId]);

  useEffect(() => {
    setExpandedItems((current) => {
      const stored = readStoredExpandedItems();
      const next = new Set(current.size > 0 ? current : stored);
      if (isFeesPath(pathname)) {
        next.add("/dashboard/fees");
      }
      return next;
    });
  }, [pathname]);

  const toggleGroup = (groupId: string) => {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      persistOpenGroups(next);
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
      persistExpandedItems(next);
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

export function SchoolAdminMobileNavLinks({
  role,
  setupMode = false,
  billingEnabled = true,
}: {
  role: UserRole;
  setupMode?: boolean;
  billingEnabled?: boolean;
}) {
  const pathname = usePathname();
  const items = useMemo(() => {
    if (setupMode) {
      return schoolAdminSetupNav;
    }
    return flattenNavItems(
      filterNavGroupsByRole(schoolAdminNavGroups, role)
        .flatMap((group) => group.items)
        .filter((item) => item.href !== "/dashboard/billing" || billingEnabled),
    );
  }, [billingEnabled, role, setupMode]);

  return (
    <nav className="flex gap-1 overflow-x-auto px-4 pb-3">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isNavItemActive(pathname, item);
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
