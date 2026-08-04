"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@makyschool/ui/components/ui/BrandLogo";
import { ThemeToggle } from "@makyschool/ui/components/ui/ThemeToggle";
import { AuthBackHomeLink } from "@/components/auth/AuthShell";

export function AuthLoginPanel({
  title,
  subtitle,
  badge,
  footer,
  mobileBanner,
  children,
  showBackHome = true,
}: {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  footer?: ReactNode;
  mobileBanner?: ReactNode;
  children: ReactNode;
  /** When true (default), show Back to home on desktop header and footer. */
  showBackHome?: boolean;
}) {
  return (
    <div className="auth-login-panel flex min-h-dvh flex-col">
      {/* Mobile: logo + theme only. Desktop: back link + theme. Avoid crowding the bar. */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-theme bg-theme-surface/80 px-4 py-3.5 backdrop-blur-sm sm:px-6 lg:border-none lg:bg-transparent lg:px-10 lg:pt-8">
        <div className="min-w-0">
          <Link href="/" className="inline-flex items-center gap-2.5 lg:hidden">
            <BrandLogo size={30} />
            <span className="truncate text-sm font-bold tracking-tight text-theme-primary">
              MakySchool
            </span>
          </Link>
          {showBackHome ? (
            <AuthBackHomeLink className="hidden lg:inline-flex" />
          ) : null}
        </div>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
        <div className="w-full max-w-[420px]">
          {mobileBanner ? (
            <div className="mb-6 lg:hidden">{mobileBanner}</div>
          ) : null}
          <div className="mb-7 lg:mb-9">
            <h1 className="text-2xl font-semibold tracking-tight text-theme-primary sm:text-[1.75rem]">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2 text-sm leading-relaxed text-theme-muted">{subtitle}</p>
            ) : null}
            {badge ? <div className="mt-4">{badge}</div> : null}
          </div>

          <div className="auth-form-card p-6 sm:p-8">{children}</div>

          {footer || showBackHome ? (
            <div className="mt-8 text-center">
              {footer ?? (showBackHome ? <AuthBackHomeLink /> : null)}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
