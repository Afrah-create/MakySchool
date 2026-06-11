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
      <div className={`${inter.className} min-h-screen bg-[#0F1117] text-[#F0F2FA]`}>
        <header className="border-b border-[#252A3A] px-6 py-4">
          <div className="mx-auto flex max-w-5xl items-center">
            <span className="text-sm font-bold tracking-tight text-[#F0F2FA]">MakySchool</span>
          </div>
        </header>

        <main className="flex min-h-[calc(100vh-57px)] flex-col items-center justify-center px-6 py-16">
          <div className="flex w-full max-w-[480px] flex-col items-center text-center">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#8B90A7]">
              {tenant.schoolSlug}.{rootDomain}
            </p>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-[#F0F2FA] sm:text-5xl">
              Welcome to your school portal
            </h1>
            <p className="mt-4 max-w-[480px] text-base font-normal leading-relaxed text-[#8B90A7]">
              Sign in with the admin credentials issued by your platform administrator, then
              complete your school setup before inviting teachers and learners.
            </p>

            <div className="mt-10 w-full border-t border-[#252A3A]" />

            <Link
              href="/login"
              className="mt-8 inline-flex rounded-full bg-[#4F6EF7] px-8 py-3 text-sm font-medium text-[#F0F2FA] transition hover:bg-[#4358d9]"
            >
              Sign in as school admin
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`${inter.className} min-h-screen bg-[#0F1117] text-[#F0F2FA]`}>
      <header className="border-b border-[#252A3A] px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center">
          <span className="text-sm font-bold tracking-tight text-[#F0F2FA]">MakySchool</span>
        </div>
      </header>

      <main className="flex min-h-[calc(100vh-57px)] flex-col items-center justify-center px-6 py-16">
        <div className="flex w-full max-w-[480px] flex-col items-center text-center">
          <p className="text-5xl font-bold tracking-tight text-[#F0F2FA] sm:text-6xl">
            MakySchool{" "}
            <span className="text-base font-bold uppercase tracking-[0.24em] text-[#8B90A7] sm:text-lg">
              Platform
            </span>
          </p>
          <h1 className="mt-8 text-3xl font-bold tracking-tight text-[#F0F2FA] sm:text-4xl">
            School management for every campus
          </h1>
          <p className="mt-4 max-w-[480px] text-base font-normal leading-relaxed text-[#8B90A7]">
            Multi-tenant SaaS for classes, marks, report cards, fees, and SMS. Each school runs
            on its own subdomain with a dedicated admin workspace.
          </p>

          <p className="mt-10 text-xs font-bold uppercase tracking-[0.22em] text-[#4F6EF7]">
            Sign in
          </p>
          <h2 className="mt-3 text-xl font-bold tracking-tight text-[#F0F2FA]">
            One login for every role
          </h2>
          <p className="mt-2 max-w-[480px] text-base font-normal leading-relaxed text-[#8B90A7]">
            Platform administrators and school admins use the same sign-in page. Your role determines
            whether you manage schools across the platform or configure your own school workspace.
          </p>

          <div className="mt-10 w-full border-t border-[#252A3A]" />

          <p className="mt-6 rounded-full border border-[#252A3A] bg-[#181C27] px-4 py-1.5 text-xs text-[#8B90A7]">
            Multi-tenant · Subdomain routing · Role-based access
          </p>

          <Link
            href="/login"
            className="mt-8 inline-flex rounded-full bg-[#4F6EF7] px-8 py-3 text-sm font-medium text-[#F0F2FA] transition hover:bg-[#4358d9]"
          >
            Sign in
          </Link>
        </div>
      </main>
    </div>
  );
}
