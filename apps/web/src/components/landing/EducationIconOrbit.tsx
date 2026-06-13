"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  Award,
  BookOpen,
  CalendarDays,
  GraduationCap,
  School,
  Users,
} from "lucide-react";
import { fadeIn } from "@/components/landing/landingMotion";

const ORBIT_DURATION = 36;

const orbitIcons = [
  { Icon: BookOpen, tone: "badge-info" },
  { Icon: Users, tone: "bg-theme-icon text-theme-muted" },
  { Icon: CalendarDays, tone: "badge-success" },
  { Icon: Award, tone: "badge-warning" },
  { Icon: School, tone: "bg-theme-accent-muted text-theme-accent" },
] as const;

export function EducationIconOrbit() {
  const reduceMotion = useReducedMotion();

  const spinTransition = reduceMotion
    ? { duration: 0 }
    : { duration: ORBIT_DURATION, repeat: Infinity, ease: "linear" as const };

  return (
    <motion.div
      className="relative mx-auto aspect-square w-full max-w-[min(100%,18rem)] sm:max-w-xs md:max-w-sm lg:max-w-md [--orbit-radius:clamp(5rem,24vw,9.5rem)]"
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      aria-hidden
    >
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 rounded-full border border-dashed border-accent-soft opacity-60"
        style={{
          width: "calc(var(--orbit-radius) * 2 + 2.75rem)",
          height: "calc(var(--orbit-radius) * 2 + 2.75rem)",
          transform: "translate(-50%, -50%)",
        }}
      />

      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[42%] w-[42%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-theme-accent-muted/50 blur-2xl" />

      <motion.div
        className="absolute left-1/2 top-1/2 z-10 flex h-[clamp(4.25rem,36%,6.25rem)] w-[clamp(4.25rem,36%,6.25rem)] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border border-accent-soft bg-theme-surface shadow-theme-soft ring-1 ring-theme-subtle sm:rounded-3xl"
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <GraduationCap
          className="h-[44%] w-[44%] min-h-9 min-w-9 text-theme-accent sm:min-h-11 sm:min-w-11"
          strokeWidth={1.25}
        />
      </motion.div>

      <motion.div
        className="absolute inset-0"
        animate={reduceMotion ? undefined : { rotate: 360 }}
        transition={spinTransition}
        style={{ transformOrigin: "50% 50%" }}
      >
        {orbitIcons.map(({ Icon, tone }, index) => {
          const angle = (360 / orbitIcons.length) * index;

          return (
            <div
              key={index}
              className="absolute left-1/2 top-1/2"
              style={{
                width: 0,
                height: 0,
                transform: `rotate(${angle}deg) translateY(calc(-1 * var(--orbit-radius)))`,
              }}
            >
              <motion.div
                animate={reduceMotion ? undefined : { rotate: -360 }}
                transition={spinTransition}
                whileHover={reduceMotion ? undefined : { scale: 1.08 }}
                className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border border-theme bg-theme-surface shadow-theme-soft sm:h-12 sm:w-12 sm:rounded-2xl md:h-14 md:w-14"
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-lg sm:h-9 sm:w-9 sm:rounded-xl md:h-10 md:w-10 ${tone}`}
                >
                  <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5" strokeWidth={1.75} />
                </span>
              </motion.div>
            </div>
          );
        })}
      </motion.div>
    </motion.div>
  );
}
