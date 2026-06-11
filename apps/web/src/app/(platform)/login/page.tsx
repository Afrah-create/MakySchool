import { headers } from "next/headers";
import { LoginForm } from "@/components/auth/LoginForm";
import { getTenantFromHeaders } from "@/lib/tenant/server";

export default async function LoginPage() {
  const headerList = await headers();
  const tenant = getTenantFromHeaders(headerList);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-indigo-700">
            MakySchool
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Sign in to your school</h1>
          {tenant?.schoolSlug ? (
            <p className="mt-2 text-sm text-slate-500">{tenant.schoolSlug}.makyschool.com</p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              Open your school subdomain to sign in as an admin.
            </p>
          )}
        </div>
        <LoginForm schoolSlug={tenant?.schoolSlug} />
      </div>
    </main>
  );
}
