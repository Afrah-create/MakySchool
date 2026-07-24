"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CreditCard,
  UserRound,
} from "lucide-react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { useApiSWR } from "@/hooks/useApiSWR";
import { formatUGX } from "@/lib/formatCurrency";
import { learnerFirstName, type LearnerMe } from "@/lib/learner/types";
import { studentInitials } from "@/lib/validation/students";

function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "danger" | "success";
}) {
  const valueClass =
    tone === "danger"
      ? "text-theme-danger"
      : tone === "success"
        ? "text-theme-success"
        : "text-theme-primary";

  return (
    <div className="rounded-2xl border border-theme bg-theme-surface p-4 sm:p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">{label}</p>
      <p className={`mt-2 text-xl font-semibold tabular-nums sm:text-2xl ${valueClass}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-theme-muted">{hint}</p> : null}
    </div>
  );
}

export function LearnerDashboardContent() {
  const { data, error, isLoading, mutate } = useApiSWR<LearnerMe>("/schools/learner/me");

  return (
    <DashboardPage maxWidth="7xl" embedded>
      <QueryState
        error={error}
        isLoading={isLoading}
        data={data}
        onRetry={() => void mutate()}
        loading={
          <div className="space-y-6">
            <Skeleton className="h-36 w-full rounded-2xl" />
            <div className="grid gap-4 sm:grid-cols-3">
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </div>
          </div>
        }
        isEmpty={() => false}
      >
        {(learner) => {
          const balance = learner.fees.total_balance;
          const paidUp = balance <= 0 && learner.fees.account_count > 0;

          return (
            <div className="space-y-8">
              <div className="ms-hero relative overflow-hidden rounded-2xl p-6 sm:p-8">
                <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="max-w-xl">
                    <p className="text-sm font-medium text-white/80">Learner portal</p>
                    <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
                      Hello, {learnerFirstName(learner.full_name)}
                    </h1>
                    <p className="mt-2 text-sm leading-relaxed text-white/85">
                      View attendance, school fees, and profile details for this learner.
                      Parents and learners share this account.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="inline-flex rounded-full bg-white/15 px-3 py-1 font-mono text-xs font-medium text-white">
                        {learner.learner_id}
                      </span>
                      {learner.class_name ? (
                        <span className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white">
                          {learner.class_name}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {learner.photo_url ? (
                    <img
                      src={learner.photo_url}
                      alt=""
                      className="h-20 w-20 rounded-2xl object-cover ring-2 ring-white/30 sm:h-24 sm:w-24"
                    />
                  ) : (
                    <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/15 text-xl font-semibold text-white sm:h-24 sm:w-24">
                      {studentInitials(learner.full_name)}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard
                  label="Class"
                  value={learner.class_name ?? "Unassigned"}
                  hint="Current enrolment"
                />
                <StatCard
                  label="Fees balance"
                  value={formatUGX(balance)}
                  hint={
                    learner.fees.account_count === 0
                      ? "No fee accounts yet"
                      : paidUp
                        ? "All clear for assigned fees"
                        : "Outstanding across terms"
                  }
                  tone={balance > 0 ? "danger" : paidUp ? "success" : "default"}
                />
                <StatCard
                  label="Fees paid"
                  value={formatUGX(learner.fees.total_paid)}
                  hint={`${learner.fees.account_count} fee account${learner.fees.account_count === 1 ? "" : "s"}`}
                />
              </div>

              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-theme-primary">Quick links</h2>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Link
                    href="/learner/attendance"
                    className="flex items-center gap-3 rounded-xl border border-theme bg-theme-surface p-4 transition hover:border-accent-soft"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-theme-accent-muted text-theme-accent">
                      <CalendarDays className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-theme-primary">Attendance</p>
                      <p className="text-xs text-theme-muted">Trends and recent days</p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-theme-muted" />
                  </Link>
                  <Link
                    href="/learner/fees"
                    className="flex items-center gap-3 rounded-xl border border-theme bg-theme-surface p-4 transition hover:border-accent-soft"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-theme-icon text-theme-muted">
                      <CreditCard className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-theme-primary">School fees</p>
                      <p className="text-xs text-theme-muted">Balances and payments</p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-theme-muted" />
                  </Link>
                  <Link
                    href="/learner/profile"
                    className="flex items-center gap-3 rounded-xl border border-theme bg-theme-surface p-4 transition hover:border-accent-soft"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-theme-icon text-theme-muted">
                      <UserRound className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-theme-primary">Profile</p>
                      <p className="text-xs text-theme-muted">Details and contacts</p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-theme-muted" />
                  </Link>
                </div>
              </section>

              {!learner.class_name ? (
                <EmptyState
                  title="No class assigned yet"
                  description="Your school will place this learner in a class soon."
                />
              ) : null}
            </div>
          );
        }}
      </QueryState>
    </DashboardPage>
  );
}
