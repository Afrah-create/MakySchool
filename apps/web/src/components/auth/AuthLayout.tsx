import type { ReactNode } from "react";

export function AuthLayout({
  brandPanel,
  children,
}: {
  brandPanel: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh bg-theme-page text-theme-primary lg:grid-cols-2">
      {brandPanel}
      {children}
    </div>
  );
}

/** @deprecated Use AuthLoginPanel for the form column instead. */
export function AuthCard({
  children,
  title,
  subtitle,
  badge,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-theme bg-theme-surface shadow-theme-panel ring-1 ring-theme-subtle">
      <div aria-hidden className="header-accent-line absolute inset-x-0 top-0 h-px" />

      <div className="px-8 pb-8 pt-10 sm:px-10 sm:pb-10 sm:pt-12">
        <div className="flex flex-col items-center text-center">
          <span className="brand-gradient flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold text-on-accent shadow-theme-accent ring-1 ring-theme-subtle">
            MS
          </span>
          <h1 className="mt-5 text-[1.625rem] font-semibold leading-tight tracking-tight text-theme-primary">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 max-w-[16rem] text-sm leading-relaxed text-theme-muted">{subtitle}</p>
          ) : null}
          {badge ? <div className="mt-5 w-full">{badge}</div> : null}
        </div>

        <div className="mt-8 border-t border-theme pt-8">{children}</div>
      </div>
    </div>
  );
}
