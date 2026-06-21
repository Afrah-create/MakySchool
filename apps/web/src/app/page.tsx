import { headers } from "next/headers";
import { DEFAULT_ROOT_DOMAIN } from "@makyschool/shared/constants";
import { fetchSchoolPreview } from "@/components/auth/AuthBrandPanel";
import { RootLanding } from "@/components/landing/RootLanding";
import { SchoolLanding } from "@/components/landing/SchoolLanding";
import { getTenantFromHeaders } from "@/lib/tenant/server";

export default async function HomePage() {
  const headerList = await headers();
  const tenant = getTenantFromHeaders(headerList);
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? DEFAULT_ROOT_DOMAIN;

  if (tenant?.schoolSlug) {
    const school = await fetchSchoolPreview(tenant.schoolSlug);

    return (
      <SchoolLanding
        schoolSlug={tenant.schoolSlug}
        rootDomain={rootDomain}
        schoolName={school?.name}
      />
    );
  }

  return <RootLanding />;
}
