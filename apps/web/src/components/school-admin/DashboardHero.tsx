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

  return (
    <div className="ms-hero relative overflow-hidden p-6 sm:p-8">
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-0 right-16 h-24 w-24 rounded-full bg-white/5"
        aria-hidden
      />

      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl">
          <p className="text-sm font-medium text-white/80">{school?.name ?? "Your school"}</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
            {greeting}, {firstName}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/85">
            Manage classes, subjects, and academic structure for your school. Review your setup and
            keep class assignments up to date.
          </p>
          <Link
            href="/dashboard/classes"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-theme-accent shadow-theme-soft transition hover:bg-white/95"
          >
            Manage classes
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="hidden shrink-0 sm:flex">
          <div className="flex h-28 w-28 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
            <GraduationCap className="h-14 w-14 text-white/90" strokeWidth={1.5} />
          </div>
        </div>
      </div>
    </div>
  );
}
