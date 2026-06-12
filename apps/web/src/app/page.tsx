import Link from "next/link";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { DEFAULT_ROOT_DOMAIN } from "@makyschool/shared/constants";
import { getTenantFromHeaders } from "@/lib/tenant/server";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "700"],
});

export default async function PlatformHomePage() {
  const headerList = await headers();
  const tenant = getTenantFromHeaders(headerList);
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? DEFAULT_ROOT_DOMAIN;

  if (tenant) {
    return (
      <div className={`${inter.className} min-h-screen bg-theme-page text-theme-primary`}>
        <header className="border-b border-theme px-6 py-4">
          <div className="mx-auto flex max-w-5xl items-center">
            <span className="text-sm font-bold tracking-tight text-theme-primary">MakySchool</span>
          </div>
        </header>

        <main className="flex min-h-[calc(100vh-57px)] flex-col items-center justify-center px-6 py-16">
          <div className="flex w-full max-w-[480px] flex-col items-center text-center">
            <p className="text-5xl font-bold tracking-tight text-theme-primary sm:text-6xl">MakySchool</p>
            <p className="mt-3 text-sm text-theme-muted">
              {tenant.schoolSlug}.{rootDomain}
            </p>

            <div className="mt-10 w-full border-t border-theme" />

            <Link
              href="/login"
              className="mt-8 inline-flex rounded-full bg-theme-accent px-8 py-3 text-sm font-medium text-on-accent transition hover:bg-theme-accent-hover"
            >
              Sign in
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`${inter.className} min-h-screen bg-theme-page text-theme-primary`}>
      <header className="border-b border-theme px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center">
          <span className="text-sm font-bold tracking-tight text-theme-primary">MakySchool</span>
        </div>
      </header>

      <main className="flex min-h-[calc(100vh-57px)] flex-col items-center justify-center px-6 py-16">
        <div className="flex w-full max-w-[480px] flex-col items-center text-center">
          <p className="text-5xl font-bold tracking-tight text-theme-primary sm:text-6xl">MakySchool</p>

          <div className="mt-10 w-full border-t border-theme" />

          <Link
            href="/login"
            className="mt-8 inline-flex rounded-full bg-theme-accent px-8 py-3 text-sm font-medium text-on-accent transition hover:bg-theme-accent-hover"
          >
            Sign in
          </Link>
        </div>
      </main>
    </div>
  );
}
