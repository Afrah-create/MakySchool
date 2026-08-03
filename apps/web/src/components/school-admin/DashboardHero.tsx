"use client";

import Link from "next/link";
import { ArrowRight, GraduationCap } from "lucide-react";
import type { SchoolRecord } from "@makyschool/shared/types";
import { useAuth } from "@/hooks/useAuth";

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function DashboardHero({ school }: { school: SchoolRecord | null }) {
  const { state } = useAuth();
  const firstName = state.user?.name?.split(" ")[0] ?? "there";
  const greeting = greetingForHour(new Date().getHours());
  const schoolName = school?.name ?? "Your school";
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <section className="ms-hero relative overflow-hidden rounded-2xl p-5 sm:p-7">
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-8 right-24 h-24 w-24 rounded-full bg-white/5"
        aria-hidden
      />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white sm:hidden">
              <GraduationCap className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-white/75 sm:text-sm">
                {schoolName}
              </p>
              <h1 className="truncate text-xl font-semibold tracking-tight text-white sm:text-2xl lg:text-3xl">
                {greeting}, {firstName}
              </h1>
            </div>
          </div>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/80">
            {today} · Enrolment, fees, attendance, and academic progress at a
            glance.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/dashboard/classes"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-theme-accent shadow-theme-soft transition hover:bg-white/95"
            >
              Manage classes
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/dashboard/teacher-attendance"
              className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-white/15"
            >
              Teacher attendance
            </Link>
          </div>
        </div>

        <div className="hidden shrink-0 sm:flex">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm lg:h-24 lg:w-24">
            <GraduationCap
              className="h-10 w-10 text-white/90 lg:h-12 lg:w-12"
              strokeWidth={1.5}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
