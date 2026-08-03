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
  /** When true (default), show Back to home in the header and as a footer fallback. */
  showBackHome?: boolean;
}) {
  return (
    <div className="auth-login-panel flex min-h-dvh flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-theme bg-theme-surface/80 px-4 py-4 backdrop-blur-sm sm:px-6 lg:border-none lg:bg-transparent lg:px-10 lg:pt-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="flex items-center gap-2 lg:hidden">
            <BrandLogo size={32} />
            <span className="truncate text-sm font-bold tracking-tight text-theme-primary">
              MakySchool
            </span>
          </Link>
          {showBackHome ? (
            <AuthBackHomeLink className="hidden lg:inline-flex" />
          ) : null}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {showBackHome ? (
            <AuthBackHomeLink className="lg:hidden" />
          ) : null}
          <ThemeToggle />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
        <div className="w-full max-w-[440px]">
          {mobileBanner ? (
            <div className="mb-6 lg:hidden">{mobileBanner}</div>
          ) : null}
          <div className="mb-8 lg:mb-10">
            <BrandLogo
              size={44}
              className="shadow-theme-accent ring-1 ring-theme-subtle lg:hidden"
            />
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-theme-primary sm:text-[1.75rem]">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2 text-sm leading-relaxed text-theme-muted">
                {subtitle}
              </p>
            ) : null}
            {badge ? <div className="mt-4">{badge}</div> : null}
          </div>

          <div className="auth-form-card p-6 sm:p-8">{children}</div>

          <div className="mt-8 text-center">
            {footer ?? (showBackHome ? <AuthBackHomeLink /> : null)}
          </div>
        </div>
      </main>
    </div>
  );
}
