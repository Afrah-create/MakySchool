import Link from "next/link";
import { theme } from "@/lib/theme";

const links = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/classes", label: "Classes & subjects" },
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
      ? [{ href: "/dashboard/setup", label: "Setup wizard" }]
      : links;

  return (
    <aside className={`hidden w-72 shrink-0 border-r ${theme.divider} bg-[#181C27] p-6 lg:flex lg:flex-col`}>
      <div>
        <p className={`text-sm font-medium ${theme.muted}`}>{schoolSlug ?? "School"}</p>
        <h1 className={`mt-2 text-xl font-semibold ${theme.heading}`}>Dashboard</h1>
      </div>
      <nav className="mt-10 space-y-1 text-sm">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="block rounded-lg px-3 py-2.5 font-medium text-[#F0F2FA] transition hover:bg-[#252A3A]"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
