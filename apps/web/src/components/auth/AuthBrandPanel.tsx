import Image from "next/image";
import { BookOpen, GraduationCap, ShieldCheck } from "lucide-react";
import { DEFAULT_ROOT_DOMAIN } from "@makyschool/shared/constants";
import { getServerApiBaseUrl } from "@/lib/api/base-url";

export type AuthSchoolPreview = {
  name: string | null;
  logo_url: string | null;
  slug: string;
  school_type: string | null;
};

function schoolTypeLabel(type: string | null | undefined) {
  if (!type) return "School";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function AuthBrandPanel({
  schoolSlug,
  rootDomain,
  school,
}: {
  schoolSlug?: string;
  rootDomain: string;
  school?: AuthSchoolPreview | null;
}) {
  const displayName = school?.name ?? (schoolSlug ? formatSlugTitle(schoolSlug) : "MakySchool");
  const domain = schoolSlug ? `${schoolSlug}.${rootDomain}` : rootDomain;

  return (
    <div className="auth-brand-panel auth-brand-grid relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between">
      <div
        className="auth-brand-orb-a pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-2xl"
        aria-hidden
      />
      <div
        className="auth-brand-orb-b pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full blur-3xl"
        aria-hidden
      />

      <div className="relative z-10 p-10 xl:p-12">
        <div className="flex items-center gap-3">
          {school?.logo_url ? (
            <div className="auth-brand-icon relative h-12 w-12 overflow-hidden rounded-xl">
              <Image
                src={school.logo_url}
                alt=""
                fill
                className="object-contain p-1.5"
                unoptimized
              />
            </div>
          ) : (
            <span className="auth-brand-icon flex h-12 w-12 items-center justify-center rounded-xl text-sm font-bold text-auth-brand-primary">
              MS
            </span>
          )}
          <div>
            <p className="text-sm font-semibold text-auth-brand-primary">MakySchool</p>
            <p className="text-xs text-auth-brand-muted">{domain}</p>
          </div>
        </div>

        <div className="mt-12 max-w-md">
          <p className="text-sm font-medium text-auth-brand-muted">
            {schoolSlug ? "School workspace" : "School management platform"}
          </p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-auth-brand-primary xl:text-4xl">
            {schoolSlug ? `Sign in to ${displayName}` : "Run your school with clarity"}
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-auth-brand-faint">
            {schoolSlug
              ? `Secure admin access for ${schoolTypeLabel(school?.school_type)} staff at ${displayName}.`
              : "Classes, subjects, academic structure, and school operations — built for Ugandan schools."}
          </p>
        </div>
      </div>

      <div className="relative z-10 space-y-4 p-10 xl:p-12">
        {[
          {
            icon: GraduationCap,
            title: "Academic structure",
            text: "Organise classes, streams, and subject assignments in one place.",
          },
          {
            icon: BookOpen,
            title: "Term-ready setup",
            text: "Configure academic years, terms, and grading during onboarding.",
          },
          {
            icon: ShieldCheck,
            title: "Secure access",
            text: "Accounts are provisioned by your school or platform administrator.",
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="auth-brand-feature flex gap-3 p-4">
              <span className="auth-brand-feature-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                <Icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-auth-brand-primary">{item.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-auth-brand-muted">{item.text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatSlugTitle(slug: string) {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function fetchSchoolPreview(slug: string): Promise<AuthSchoolPreview | null> {
  try {
    const response = await fetch(`${getServerApiBaseUrl()}/auth/school/${encodeURIComponent(slug)}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { data: AuthSchoolPreview };
    return payload.data;
  } catch {
    return null;
  }
}
