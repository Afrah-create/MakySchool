import Link from "next/link";
import { headers } from "next/headers";
import { getTenantFromHeaders } from "@/lib/tenant/server";

export default async function PlatformHomePage() {
  const headerList = await headers();
  const tenant = getTenantFromHeaders(headerList);

  if (tenant) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-primary">
            {tenant.schoolSlug}.makyschool.com
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">
            School portal
          </h1>
          <p className="mt-4 text-lg text-muted">
            Tenant routing is active. Sign in to access your school dashboard.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
          >
            Sign in
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium"
          >
            Dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-primary">
          MakySchool
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          School management for every campus
        </h1>
        <p className="mt-4 text-lg text-muted">
          Multi-tenant SaaS for classes, marks, report cards, fees, and SMS —
          each school on its own subdomain.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/register"
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
        >
          Register a school
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
