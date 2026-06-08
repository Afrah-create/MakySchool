import Link from "next/link";
import { headers } from "next/headers";
import { getTenantFromHeaders } from "@/lib/tenant/server";

export default async function TenantDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerList = await headers();
  const tenant = getTenantFromHeaders(headerList);

  return (
    <div className="min-h-screen">
      <nav className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <Link href="/dashboard" className="font-semibold">
              MakySchool
            </Link>
            {tenant && (
              <p className="text-xs text-muted">{tenant.schoolSlug}</p>
            )}
          </div>
          <Link href="/login" className="text-sm text-muted hover:text-foreground">
            Sign out
          </Link>
        </div>
      </nav>
      <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
    </div>
  );
}
