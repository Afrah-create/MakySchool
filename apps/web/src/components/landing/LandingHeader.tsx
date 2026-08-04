"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { BrandLogo } from "@makyschool/ui/components/ui/BrandLogo";
import { ThemeToggle } from "@makyschool/ui/components/ui/ThemeToggle";
import { fadeUp } from "@/components/landing/landingMotion";

export function LandingHeader() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.header
      className="relative z-10 border-b border-theme bg-theme-surface/80 backdrop-blur-sm"
      initial={{ opacity: 0, y: reduceMotion ? 0 : -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6 sm:py-4">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <BrandLogo size={32} className="shrink-0 shadow-theme-accent" />
          <span className="truncate text-sm font-bold tracking-tight text-theme-primary">
            MakySchool
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          <Link
            href="/login"
            className="ms-btn-primary rounded-full px-3.5 py-1.5 text-xs shadow-theme-accent sm:px-5 sm:py-2 sm:text-sm"
          >
            Sign in
          </Link>
        </div>
      </div>
    </motion.header>
  );
}

export function LandingFeaturePills({ features }: { features: string[] }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.ul
      className="mt-8 flex flex-wrap gap-2"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.06, delayChildren: 0.35 } },
      }}
    >
      {features.map((feature) => (
        <motion.li
          key={feature}
          variants={fadeUp}
          className="rounded-full border border-theme bg-theme-surface px-3.5 py-1.5 text-xs font-medium text-theme-muted shadow-theme-card"
        >
          {feature}
        </motion.li>
      ))}
    </motion.ul>
  );
}
