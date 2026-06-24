import Link from "next/link";
import { BrandLogo } from "@makyschool/ui/components/ui/BrandLogo";
import { bookDemoUrl, navLinks, siteConfig, siteUrl } from "@/lib/site";
import { marketingContainer, sectionY } from "@/lib/layout";

const footerGroups = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/solutions", label: "Solutions" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { href: "/solutions/primary-schools", label: "Primary schools" },
      { href: "/solutions/secondary-schools", label: "Secondary schools" },
      { href: "/solutions/fees-bursar", label: "Fees & bursar" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/contact", label: "Contact" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
] as const;

export function MarketingFooter() {
  return (
    <footer className="border-t border-theme bg-theme-surface">
      <div className={`${marketingContainer} ${sectionY}`}>
        <div className="grid gap-8 sm:grid-cols-2 sm:gap-10 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2.5">
              <BrandLogo size={36} className="shadow-theme-accent" />
              <span className="text-sm font-bold tracking-tight text-theme-primary">
                {siteConfig.name}
              </span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-theme-muted">
              {siteConfig.description}
            </p>
            <p className="mt-4 text-xs text-theme-faint">
              Built by{" "}
              <a
                href={siteConfig.companyUrl}
                className="font-medium text-theme-accent hover:underline"
                rel="noopener noreferrer"
                target="_blank"
              >
                {siteConfig.company}
              </a>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-6 sm:col-span-2 sm:grid-cols-3 lg:col-span-2">
            {footerGroups.map((group) => (
              <div key={group.title}>
                <h2 className="text-sm font-semibold text-theme-primary">{group.title}</h2>
                <ul className="mt-3 space-y-2 sm:mt-4">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-theme-muted transition hover:text-theme-primary"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="sm:col-span-2 lg:col-span-1">
            <h2 className="text-sm font-semibold text-theme-primary">Get started</h2>
            <p className="mt-3 text-sm text-theme-muted sm:mt-4">
              See MakySchool in action with a guided walkthrough for your school.
            </p>
            <Link
              href={bookDemoUrl}
              className="marketing-cta-button mt-4 inline-flex rounded-full bg-theme-accent px-5 py-2.5 text-sm font-semibold text-on-accent shadow-theme-accent transition hover:bg-theme-accent-hover sm:w-auto"
            >
              Book a demo
            </Link>
            <p className="mt-4 text-xs text-theme-faint sm:mt-6">{siteUrl}</p>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-theme pt-6 text-xs text-theme-faint sm:mt-12 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
          </p>
          <nav className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Footer">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-theme-muted">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
