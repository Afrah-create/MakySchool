"use client";

import Link from "next/link";
import { BookOpen, GraduationCap, Settings2 } from "lucide-react";
import { subscriptionsEnabled } from "@makyschool/shared/constants";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { DashboardStats } from "@/components/tenant/DashboardStats";
import { OverviewHeader } from "@/components/tenant/OverviewHeader";
import { SubscriptionBanner } from "@/components/tenant/SubscriptionBanner";
import { useTenantSchool } from "@/providers/TenantSchoolProvider";

export function TenantDashboardHome() {
  const { school } = useTenantSchool();

  return (
    <DashboardPage header={<OverviewHeader school={school} />}>
      <div className="space-y-6">
        {subscriptionsEnabled() ? <SubscriptionBanner /> : null}
        <DashboardStats />

        <div>
          <h2 className="text-sm font-semibold text-theme-primary">Quick actions</h2>
          <p className="mt-0.5 text-sm text-theme-muted">
            Common tasks for managing your school.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Link
              href="/dashboard/classes"
              className="group flex items-start gap-4 rounded-xl border border-theme bg-theme-surface p-5 transition hover:border-accent-soft hover:bg-theme-raised"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-theme-accent-muted text-theme-accent transition group-hover:bg-theme-accent group-hover:text-on-accent">
                <BookOpen className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-theme-primary">Classes & subjects</h3>
                <p className="mt-1 text-sm leading-relaxed text-theme-muted">
                  Create class levels, streams, and link subjects to each class.
                </p>
              </div>
            </Link>

            <div className="flex items-start gap-4 rounded-xl border border-dashed border-theme bg-theme-subtle p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-theme-icon text-theme-muted">
                <GraduationCap className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-theme-primary">Teachers & students</h3>
                <p className="mt-1 text-sm leading-relaxed text-theme-muted">
                  User management is coming soon. Schools are provisioned by your platform team.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 rounded-xl border border-dashed border-theme bg-theme-subtle p-5 md:col-span-2">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-theme-icon text-theme-muted">
                <Settings2 className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-theme-primary">School profile</h3>
                <p className="mt-1 text-sm leading-relaxed text-theme-muted">
                  Logo, academic year, and grading settings were configured during setup. Profile
                  editing will be available in a future release.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardPage>
  );
}
