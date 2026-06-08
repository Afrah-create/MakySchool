import Link from "next/link";
import { headers } from "next/headers";
import { getTenantFromHeaders } from "@/lib/tenant/server";

const modules = [
  { href: "/dashboard/admin", label: "School profile & setup" },
  { href: "/dashboard/academic/classes", label: "Classes & subjects" },
  { href: "/dashboard/users", label: "Users & roles" },
  { href: "/dashboard/teachers", label: "Teachers" },
  { href: "/dashboard/students", label: "Students" },
  { href: "/dashboard/marks", label: "Marks entry" },
  { href: "/dashboard/report-cards", label: "Report cards" },
  { href: "/dashboard/fees", label: "Fees & subscription" },
  { href: "/dashboard/communication", label: "SMS (MakyReach)" },
];

export default async function DashboardPage() {
  const headerList = await headers();
  const tenant = getTenantFromHeaders(headerList);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <header className="mb-10 border-b border-border pb-6">
        <p className="text-sm text-muted">
          {tenant
            ? `${tenant.schoolSlug}.makyschool.com`
            : "Platform (no tenant context)"}
        </p>
        <h1 className="mt-1 text-3xl font-semibold">Dashboard</h1>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2">
        {modules.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block rounded-xl border border-border p-4 transition hover:border-primary"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
