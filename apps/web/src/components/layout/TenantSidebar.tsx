import Link from "next/link";

const links = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/classes", label: "Classes & Subjects" },
  { href: "/dashboard/billing", label: "Billing" },
];

export function TenantSidebar({
  schoolSlug,
  schoolStatus,
}: {
  schoolSlug?: string;
  schoolStatus?: string;
}) {
  const navLinks =
    schoolStatus === "setup"
      ? [{ href: "/dashboard/setup", label: "Setup Wizard" }]
      : links;

  return (
    <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white/90 p-6 shadow-sm lg:flex lg:flex-col">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          {schoolSlug ?? "Tenant"}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Classes, setup, and subscription controls for the current school.
        </p>
      </div>
      <nav className="mt-10 space-y-2 text-sm">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="block rounded-2xl px-4 py-3 font-medium text-slate-700 transition hover:bg-slate-100"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
