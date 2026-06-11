import Link from "next/link";
import { headers } from "next/headers";
import { DEFAULT_ROOT_DOMAIN } from "@makyschool/shared/constants";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { getTenantFromHeaders } from "@/lib/tenant/server";

export default async function LoginPage() {
  const headerList = await headers();
  const tenant = getTenantFromHeaders(headerList);
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? DEFAULT_ROOT_DOMAIN;
  const schoolSlug = tenant?.schoolSlug;

  return (
    <AuthShell
      footer={
        <Link href="/" className="font-medium text-indigo-700 hover:text-indigo-800">
          Back to home
        </Link>
      }
    >
      {schoolSlug ? (
        <div className="mb-5 rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-sm text-indigo-900">
          Signing in to <span className="font-semibold">{schoolSlug}.{rootDomain}</span>
        </div>
      ) : null}
      <LoginForm initialSchoolSlug={schoolSlug} lockedSchoolSlug={schoolSlug} />
    </AuthShell>
  );
}
