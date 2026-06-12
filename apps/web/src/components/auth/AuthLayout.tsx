import Link from "next/link";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export function AuthLayout({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className={`${inter.className} relative flex min-h-screen flex-col bg-theme-page text-theme-primary`}>
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="auth-accent-orb absolute -left-32 top-0 h-[28rem] w-[28rem] rounded-full blur-3xl" />
        <div className="auth-accent-orb-soft absolute -right-24 bottom-0 h-80 w-80 rounded-full blur-3xl" />
        <div className="auth-page-vignette absolute inset-0" />
      </div>

      <header className="relative z-10 shrink-0 border-b border-theme px-6 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center">
          <Link
            href="/"
            className="text-sm font-bold tracking-tight text-theme-primary transition hover:text-on-accent"
          >
            MakySchool
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-12 sm:px-6 sm:py-16">
        <div className="w-full max-w-[420px]">
          {children}
          {footer ? <div className="mt-8 text-center">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}

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
