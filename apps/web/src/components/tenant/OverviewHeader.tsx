"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { SchoolRecord } from "@makyschool/shared/types";

function schoolTypeLabel(type: string | null | undefined) {
  if (!type) return "School";
  return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " ");
}

export function OverviewHeader({ school }: { school: SchoolRecord | null }) {
  return (
    <div className="border-b border-theme bg-theme-surface">
      <div className="relative overflow-hidden px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <div
          className="overview-header-glow pointer-events-none absolute inset-0 opacity-40"
          aria-hidden
        />
        <div className="relative mx-auto flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            {school?.logo_url ? (
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-theme bg-input">
                <Image
                  src={school.logo_url}
                  alt=""
                  fill
                  className="object-contain p-1.5"
                  unoptimized
                />
              </div>
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-theme bg-theme-accent-muted text-lg font-bold text-theme-accent">
                {(school?.name ?? "S").charAt(0).toUpperCase()}
              </span>
            )}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">
                School admin
              </p>
              <h1 className="mt-1 text-xl font-semibold text-theme-primary sm:text-2xl">
                {school?.name ?? "Dashboard"}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full border border-theme bg-input px-2.5 py-0.5 text-xs font-medium text-theme-muted">
                  {schoolTypeLabel(school?.school_type)}
                </span>
                {school?.status === "active" ? (
                  <span className="badge-success inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium">
                    Active
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <Link
            href="/dashboard/classes"
            className="inline-flex shrink-0 items-center justify-center gap-2 ms-btn-primary px-4 py-2.5"
          >
            Manage classes
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
