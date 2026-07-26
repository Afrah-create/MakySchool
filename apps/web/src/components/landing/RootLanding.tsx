"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, BookOpen, CalendarDays, GraduationCap, Users } from "lucide-react";
import { EducationIconOrbit } from "@/components/landing/EducationIconOrbit";
import { LandingFeaturePills, LandingHeader } from "@/components/landing/LandingHeader";
import { containerStagger, fadeUp, scaleIn } from "@/components/landing/landingMotion";

const platformFeatures = [
  "Classes & streams",
  "Subject linking",
  "Academic terms",
  "Grading scales",
];

const mobileHighlights = [
  { icon: BookOpen, label: "Classes" },
  { icon: Users, label: "Staff & learners" },
  { icon: CalendarDays, label: "Timetables" },
] as const;

export function RootLanding() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="auth-login-panel flex min-h-dvh flex-col">
      <LandingHeader />

      <main className="relative flex flex-1 items-center overflow-hidden px-5 py-10 sm:px-8 sm:py-12 lg:py-16">
        <div
          className="pointer-events-none absolute -left-32 top-0 h-96 w-96 rounded-full auth-brand-orb-a blur-3xl"
          aria-hidden
        />

        <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <motion.div
            variants={containerStagger}
            initial="hidden"
            animate="visible"
            className="max-w-xl"
          >
            <motion.p variants={fadeUp} className="text-sm font-medium text-theme-accent">
              School management platform
            </motion.p>
            <motion.h1
              variants={fadeUp}
              className="mt-3 text-[2rem] font-semibold leading-tight tracking-tight text-theme-primary sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]"
            >
              Run your school with clarity
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="mt-4 text-sm leading-relaxed text-theme-muted sm:text-base sm:text-lg"
            >
              Classes, subjects, academic structure, and school operations built for Ugandan
              primary and secondary schools.
            </motion.p>

            <motion.div variants={scaleIn} className="mt-7 sm:mt-8">
              <Link
                href="/login"
                className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-theme-accent px-7 py-3.5 text-sm font-semibold text-on-accent shadow-theme-accent transition hover:bg-theme-accent-hover sm:w-auto"
              >
                Sign in to your workspace
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
            </motion.div>

            <div className="mt-8 grid grid-cols-3 gap-2 sm:hidden">
              {mobileHighlights.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-theme bg-theme-surface px-2.5 py-3 text-center shadow-theme-card"
                >
                  <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-theme-accent-muted text-theme-accent">
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <p className="mt-2 text-[11px] font-medium text-theme-muted">{label}</p>
                </div>
              ))}
            </div>

            <div className="hidden sm:block">
              <LandingFeaturePills features={platformFeatures} />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: reduceMotion ? 0 : 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: reduceMotion ? 0 : 0.65,
              delay: reduceMotion ? 0 : 0.15,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="mx-auto hidden w-full max-w-lg lg:block lg:max-w-none"
          >
            <EducationIconOrbit />
          </motion.div>

          <div className="mx-auto hidden w-full max-w-sm justify-center sm:flex lg:hidden" aria-hidden>
            <div className="flex h-28 w-28 items-center justify-center rounded-3xl border border-accent-soft bg-theme-surface shadow-theme-soft ring-1 ring-theme-subtle">
              <GraduationCap className="h-14 w-14 text-theme-accent" strokeWidth={1.25} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
