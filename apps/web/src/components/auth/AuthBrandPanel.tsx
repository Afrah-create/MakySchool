import Image from "next/image";
import { BookOpen, GraduationCap, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@makyschool/ui/components/ui/BrandLogo";
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

  const features = schoolSlug
    ? [
        {
          icon: GraduationCap,
          title: "Your school workspace",
          text: `${schoolTypeLabel(school?.school_type)} staff portal for ${displayName}.`,
        },
        {
          icon: BookOpen,
          title: "Academics & operations",
          text: "Classes, results, attendance, and fees in one place.",
        },
        {
          icon: ShieldCheck,
          title: "Secure by design",
          text: "Sign in with credentials from your school administrator.",
        },
      ]
    : [
        {
          icon: GraduationCap,
          title: "Academic structure",
          text: "Classes, streams, subjects, and grading in one system.",
        },
        {
          icon: BookOpen,
          title: "Term-ready operations",
          text: "Years, terms, timetables, and results built for Ugandan schools.",
        },
        {
          icon: ShieldCheck,
          title: "Role-based access",
          text: "Admins, teachers, bursars, and learners each get the right tools.",
        },
      ];

  return (
    <aside className="auth-brand-panel auth-brand-grid relative hidden overflow-hidden lg:flex lg:flex-col">
      <div
        className="auth-brand-orb-a pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full blur-3xl"
        aria-hidden
      />
      <div
        className="auth-brand-orb-b pointer-events-none absolute -bottom-28 -left-16 h-80 w-80 rounded-full blur-3xl"
        aria-hidden
      />

      <div className="relative z-10 flex flex-1 flex-col justify-between p-10 xl:p-14">
        <div>
          <div className="flex items-center gap-3.5">
            {school?.logo_url ? (
              <div className="auth-brand-icon relative h-14 w-14 overflow-hidden rounded-2xl">
                <Image
                  src={school.logo_url}
                  alt=""
                  fill
                  className="object-contain p-2"
                  unoptimized
                />
              </div>
            ) : (
              <BrandLogo
                size={56}
                className="auth-brand-icon shadow-theme-accent ring-1 ring-theme-subtle"
              />
            )}
            <div className="min-w-0">
              <p className="text-base font-semibold tracking-tight text-auth-brand-primary">
                MakySchool
              </p>
              <p className="mt-0.5 truncate text-xs text-auth-brand-muted">{domain}</p>
            </div>
          </div>

          <div className="mt-14 max-w-md">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-auth-brand-muted">
              {schoolSlug ? "School workspace" : "School management"}
            </p>
            <h1 className="mt-3 text-[2.15rem] font-semibold leading-[1.15] tracking-tight text-auth-brand-primary xl:text-[2.5rem]">
              {schoolSlug ? displayName : "Clarity for every school day"}
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-auth-brand-faint">
              {schoolSlug
                ? "Sign in to manage academics, staff, and school operations."
                : "Primary and secondary school operations — designed for Uganda."}
            </p>
          </div>
        </div>

        <ul className="mt-12 max-w-md space-y-5 border-t border-[color-mix(in_srgb,var(--auth-brand-text)_14%,transparent)] pt-8">
          {features.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.title} className="flex gap-3.5">
                <span className="auth-brand-feature-icon mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-auth-brand-primary">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-auth-brand-muted">{item.text}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
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
