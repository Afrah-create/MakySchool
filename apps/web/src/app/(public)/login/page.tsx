import Link from "next/link";
import { headers } from "next/headers";
import { DEFAULT_ROOT_DOMAIN } from "@makyschool/shared/constants";
import { AuthBrandPanel, fetchSchoolPreview } from "@/components/auth/AuthBrandPanel";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthLoginPanel } from "@/components/auth/AuthLoginPanel";
import { AuthMobileBanner } from "@/components/auth/AuthMobileBanner";
import { LoginForm } from "@/components/auth/LoginForm";
import { getTenantFromHeaders } from "@/lib/tenant/server";

export default async function LoginPage() {
  const headerList = await headers();
  const tenant = getTenantFromHeaders(headerList);
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? DEFAULT_ROOT_DOMAIN;
  const schoolSlug = tenant?.schoolSlug;
  const school = schoolSlug ? await fetchSchoolPreview(schoolSlug) : null;

  const title = schoolSlug
    ? `Welcome to ${school?.name ?? "your school"}`
    : "Sign in to MakySchool";
  const subtitle = schoolSlug
    ? "Enter your credentials to access your school workspace."
    : "Use the email and password provided by your administrator.";

  return (
    <AuthLayout
      brandPanel={
        <AuthBrandPanel schoolSlug={schoolSlug} rootDomain={rootDomain} school={school} />
      }
    >
      <AuthLoginPanel
        title={title}
        subtitle={subtitle}
        mobileBanner={
          schoolSlug ? (
            <AuthMobileBanner
              headline={school?.name ?? `${schoolSlug} workspace`}
              description={`Admin & staff portal · ${schoolSlug}.${rootDomain}`}
            />
          ) : undefined
        }
        badge={
          schoolSlug ? (
            <div className="auth-context-chip inline-flex items-center gap-2 px-3.5 py-2.5">
              <span className="badge-success h-1.5 w-1.5 shrink-0 rounded-full p-0" aria-hidden />
              <p className="text-xs text-theme-muted">
                Workspace:{" "}
                <span className="font-medium text-theme-primary">
                  {schoolSlug}.{rootDomain}
                </span>
              </p>
            </div>
          ) : undefined
        }
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
        <LoginForm initialSchoolSlug={schoolSlug} lockedSchoolSlug={schoolSlug} />
      </AuthLoginPanel>
    </AuthLayout>
  );
}
