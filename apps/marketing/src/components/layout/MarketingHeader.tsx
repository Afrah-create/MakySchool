"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Layers3,
  Mail,
  Menu,
  Puzzle,
  Tag,
  X,
} from "lucide-react";
import { BrandLogo } from "@makyschool/ui/components/ui/BrandLogo";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ThemeToggle } from "@makyschool/ui/components/ui/ThemeToggle";
import { cn } from "@makyschool/ui/lib/cn";
import { bookDemoUrl, navLinks, siteConfig } from "@/lib/site";
import { marketingContainer } from "@/lib/layout";

const navIcons = {
  "/features": Layers3,
  "/solutions": Puzzle,
  "/pricing": Tag,
  "/contact": Mail,
} as const;

function isNavActive(href: string, pathname: string) {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MarketingHeader() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-[background-color,box-shadow,padding] duration-300",
        scrolled
          ? "border-theme bg-theme-header-surface/95 py-2 shadow-theme-panel backdrop-blur-lg"
          : "border-transparent bg-theme-header-surface/80 py-3 backdrop-blur-md sm:py-4",
      )}
    >
      <div className={`${marketingContainer} flex items-center justify-between gap-3 sm:gap-4`}>
        <Link href="/" className="group flex min-w-0 items-center gap-2.5 sm:gap-3">
          <BrandLogo size={40} className="shadow-theme-accent transition group-hover:scale-[1.02]" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-bold tracking-tight text-theme-primary">
              {siteConfig.name}
            </span>
            <span className="hidden truncate text-[11px] text-theme-faint sm:block">
              {siteConfig.tagline}
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {navLinks.map((link) => {
            const Icon = navIcons[link.href];
            const active = isNavActive(link.href, pathname);

            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition",
                  active
                    ? "bg-theme-accent-muted text-theme-accent"
                    : "text-theme-muted hover:bg-theme-surface-raised hover:text-theme-primary",
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          <Link
            href={bookDemoUrl}
            className="ms-btn-primary inline-flex h-9 w-9 items-center justify-center rounded-full shadow-theme-accent sm:h-auto sm:w-auto sm:gap-2 sm:px-5 sm:py-2"
            aria-label="Book a demo"
          >
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">Book a demo</span>
          </Link>
          <button
            type="button"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((open) => !open)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-theme bg-theme-surface text-theme-primary lg:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            id="mobile-nav"
            initial={reduceMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-theme bg-theme-surface lg:hidden"
          >
            <nav className={`${marketingContainer} flex flex-col gap-1 py-4`} aria-label="Mobile">
              {navLinks.map((link) => {
                const Icon = navIcons[link.href];
                const active = isNavActive(link.href, pathname);

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition",
                      active
                        ? "bg-theme-accent-muted text-theme-accent"
                        : "text-theme-muted hover:bg-theme-bg hover:text-theme-primary",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {link.label}
                  </Link>
                );
              })}
              <Link
                href={bookDemoUrl}
                className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-theme-accent px-5 py-3 text-sm font-semibold text-on-accent shadow-theme-accent"
              >
                <CalendarDays className="h-4 w-4" />
                Book a demo
              </Link>
            </nav>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
