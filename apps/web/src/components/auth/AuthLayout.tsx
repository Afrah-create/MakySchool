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
    <div className={`${inter.className} relative flex min-h-screen flex-col bg-[#0F1117] text-[#F0F2FA]`}>
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 top-0 h-[28rem] w-[28rem] rounded-full bg-[#4F6EF7]/[0.07] blur-3xl" />
        <div className="absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-[#4F6EF7]/[0.05] blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#0F1117_72%)]" />
      </div>

      <header className="relative z-10 shrink-0 border-b border-[#252A3A]/80 px-6 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center">
          <Link
            href="/"
            className="text-sm font-bold tracking-tight text-[#F0F2FA] transition hover:text-white"
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
    <div className="relative overflow-hidden rounded-2xl border border-[#252A3A]/90 bg-[#181C27] shadow-2xl shadow-black/50 ring-1 ring-white/[0.04]">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#4F6EF7]/60 to-transparent"
      />

      <div className="px-8 pb-8 pt-10 sm:px-10 sm:pb-10 sm:pt-12">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#4F6EF7] to-[#3D5CE6] text-sm font-bold text-white shadow-lg shadow-[#4F6EF7]/30 ring-1 ring-white/10">
            MS
          </span>
          <h1 className="mt-5 text-[1.625rem] font-semibold leading-tight tracking-tight text-[#F0F2FA]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 max-w-[16rem] text-sm leading-relaxed text-[#8B90A7]">{subtitle}</p>
          ) : null}
          {badge ? <div className="mt-5 w-full">{badge}</div> : null}
        </div>

        <div className="mt-8 border-t border-[#252A3A]/80 pt-8">{children}</div>
      </div>
    </div>
  );
}
