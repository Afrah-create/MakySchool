"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { EducationIconOrbit } from "@/components/landing/EducationIconOrbit";
import { LandingFeaturePills, LandingHeader } from "@/components/landing/LandingHeader";
import { containerStagger, fadeUp, scaleIn } from "@/components/landing/landingMotion";

function formatSlugTitle(slug: string) {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function SchoolLanding({
  schoolSlug,
  rootDomain,
  schoolName,
}: {
  schoolSlug: string;
  rootDomain: string;
  schoolName?: string | null;
}) {
  const reduceMotion = useReducedMotion();
  const displayName = schoolName ?? formatSlugTitle(schoolSlug);
  const tenantFeatures = ["Admin portal", "Class structure", "Subject setup", "Secure access"];

  return (
    <div className="auth-login-panel flex min-h-dvh flex-col">
      <LandingHeader />

      <main className="relative flex flex-1 items-center overflow-hidden px-6 py-12 sm:px-8 lg:py-16">
        <div
          className="pointer-events-none absolute -left-32 top-0 h-96 w-96 rounded-full auth-brand-orb-a blur-3xl"
          aria-hidden
        />

        <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <motion.div
            variants={containerStagger}
            initial="hidden"
            animate="visible"
            className="max-w-xl"
          >
            <motion.div variants={fadeUp} className="auth-context-chip inline-flex items-center gap-2 px-3.5 py-2">
              <span className="badge-success h-1.5 w-1.5 shrink-0 rounded-full p-0" aria-hidden />
              <span className="text-xs text-theme-muted">
                <span className="font-medium text-theme-primary">
                  {schoolSlug}.{rootDomain}
                </span>
              </span>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="mt-5 text-4xl font-semibold tracking-tight text-theme-primary sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]"
            >
              Welcome to {displayName}
            </motion.h1>
            <motion.p variants={fadeUp} className="mt-4 text-base leading-relaxed text-theme-muted sm:text-lg">
              Sign in to manage classes, subjects, and your school&apos;s academic structure.
            </motion.p>

            <motion.div variants={scaleIn} className="mt-8">
              <Link
                href="/login"
                className="group inline-flex items-center gap-2 rounded-full bg-theme-accent px-7 py-3.5 text-sm font-semibold text-on-accent shadow-theme-accent transition hover:bg-theme-accent-hover"
              >
                Sign in
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
            </motion.div>

            <LandingFeaturePills features={tenantFeatures} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: reduceMotion ? 0 : 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.65, delay: reduceMotion ? 0 : 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto w-full max-w-lg lg:max-w-none"
          >
            <EducationIconOrbit />
          </motion.div>
        </div>
      </main>
    </div>
  );
}
