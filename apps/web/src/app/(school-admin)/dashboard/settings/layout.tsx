"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@makyschool/ui/lib/cn";
import { CanDo } from "@/components/ui/CanDo";

const tabs = [
  { href: "/dashboard/settings", label: "Profile", exact: true, action: null },
  { href: "/dashboard/settings/accounts", label: "Chart of accounts", exact: false, action: "viewAccounts" as const },
] as const;

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">School</p>
        <h1 className="text-xl font-semibold text-theme-primary">Settings</h1>
      </div>
      <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto rounded-xl border border-theme bg-input p-1">
        {tabs.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          const link = (
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
          if (tab.action) {
            return (
              <CanDo key={tab.href} action={tab.action}>
                {link}
              </CanDo>
            );
          }
          return link;
        })}
      </nav>
      {children}
    </div>
  );
}
