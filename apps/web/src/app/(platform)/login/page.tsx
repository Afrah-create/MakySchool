import Link from "next/link";
import { headers } from "next/headers";
import { DEFAULT_ROOT_DOMAIN } from "@makyschool/shared/constants";
import { AuthCard, AuthLayout } from "@/components/auth/AuthLayout";
import { LoginForm } from "@/components/auth/LoginForm";
import { getTenantFromHeaders } from "@/lib/tenant/server";

export default async function LoginPage() {
  const headerList = await headers();
  const tenant = getTenantFromHeaders(headerList);
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? DEFAULT_ROOT_DOMAIN;
  const schoolSlug = tenant?.schoolSlug;

  return (
    <AuthLayout
      footer={
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-theme-muted no-underline transition hover:text-theme-primary"
        >
          <span aria-hidden>←</span>
          Back to home
        </Link>
      }
    >
      <AuthCard
        title="Welcome back"
        subtitle={schoolSlug ? "Sign in to your school workspace" : "Sign in to your account"}
        badge={
          schoolSlug ? (
            <div className="flex items-center justify-center gap-2.5 rounded-lg border border-theme bg-theme-subtle px-3.5 py-2.5">
              <span className="badge-success h-1.5 w-1.5 shrink-0 rounded-full p-0" aria-hidden />
              <p className="text-xs leading-none text-theme-muted">
                <span className="font-medium text-theme-primary">
                  {schoolSlug}.{rootDomain}
                </span>
              </p>
            </div>
          ) : undefined
        }
      >
        <LoginForm initialSchoolSlug={schoolSlug} lockedSchoolSlug={schoolSlug} />
      </AuthCard>
    </AuthLayout>
  );
}
