"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CreditCard,
  FileText,
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
    <div className="min-w-[10.5rem] flex-1 rounded-2xl border border-theme bg-theme-surface p-3.5 sm:min-w-0 sm:p-5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-theme-muted sm:text-xs">
        {label}
      </p>
      <p className={`mt-1.5 text-lg font-semibold tabular-nums sm:mt-2 sm:text-2xl ${valueClass}`}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-theme-muted sm:text-xs">{hint}</p> : null}
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  title,
  description,
  accent = false,
}: {
  href: string;
  icon: typeof CalendarDays;
  title: string;
  description: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-theme bg-theme-surface p-3.5 transition hover:border-accent-soft sm:p-4"
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          accent ? "bg-theme-accent-muted text-theme-accent" : "bg-theme-icon text-theme-muted"
        }`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-theme-primary">{title}</p>
        <p className="text-xs text-theme-muted">{description}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-theme-muted" />
    </Link>
  );
}

function LearnerAvatar({
  learner,
  size = "md",
}: {
  learner: LearnerMe;
  size?: "sm" | "md";
}) {
  const sizeClass = size === "sm" ? "h-12 w-12 text-sm" : "h-20 w-20 text-xl sm:h-24 sm:w-24";

  if (learner.photo_url) {
    return (
      <img
        src={learner.photo_url}
        alt=""
        className={`${sizeClass} shrink-0 rounded-2xl object-cover ring-2 ring-white/30`}
      />
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-2xl bg-white/15 font-semibold text-white ${sizeClass}`}
    >
      {studentInitials(learner.full_name)}
    </span>
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
          <div className="space-y-5">
            <Skeleton className="h-20 w-full rounded-2xl sm:h-36" />
            <div className="flex gap-3 overflow-hidden sm:grid sm:grid-cols-3">
              <Skeleton className="h-24 min-w-[10.5rem] flex-1" />
              <Skeleton className="h-24 min-w-[10.5rem] flex-1" />
              <Skeleton className="h-24 min-w-[10.5rem] flex-1" />
            </div>
            <div className="space-y-3">
              <Skeleton className="h-16 w-full rounded-2xl" />
              <Skeleton className="h-16 w-full rounded-2xl" />
            </div>
          </div>
        }
        isEmpty={() => false}
      >
        {(learner) => {
          const balance = learner.fees.total_balance;
          const paidUp = balance <= 0 && learner.fees.account_count > 0;
          const firstName = learnerFirstName(learner.full_name);

          return (
            <div className="space-y-6 sm:space-y-8">
              {/* Compact mobile greeting */}
              <div className="flex items-center gap-3 rounded-2xl border border-theme bg-theme-surface p-3.5 sm:hidden">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-theme-accent-muted text-sm font-semibold text-theme-accent">
                  {learner.photo_url ? (
                    <img src={learner.photo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    studentInitials(learner.full_name)
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-theme-muted">Hello</p>
                  <h1 className="truncate text-lg font-semibold text-theme-primary">{firstName}</h1>
                  <p className="mt-0.5 truncate text-xs text-theme-muted">
                    {learner.class_name ?? "No class yet"}
                    <span className="text-theme-faint"> · </span>
                    <span className="font-mono">{learner.learner_id}</span>
                  </p>
                </div>
              </div>

              {/* Full hero from sm+ */}
              <div className="ms-hero relative hidden overflow-hidden rounded-2xl p-6 sm:block sm:p-8">
                <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="max-w-xl">
                    <p className="text-sm font-medium text-white/80">Learner portal</p>
                    <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Hello, {firstName}</h1>
                    <p className="mt-2 text-sm leading-relaxed text-white/85">
                      View attendance, school fees, timetable, and profile details in one place.
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
                  <LearnerAvatar learner={learner} />
                </div>
              </div>

              <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
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
                <div>
                  <h2 className="text-sm font-semibold text-theme-primary">Quick links</h2>
                  <p className="text-xs text-theme-muted">Jump to the pages you use most</p>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  <QuickLink
                    href="/learner/fees"
                    icon={CreditCard}
                    title="School fees"
                    description={
                      balance > 0 ? `${formatUGX(balance)} outstanding` : "Balances and payments"
                    }
                    accent={balance > 0}
                  />
                  <QuickLink
                    href="/learner/timetable"
                    icon={CalendarDays}
                    title="Timetable"
                    description="This week’s lessons"
                    accent
                  />
                  <QuickLink
                    href="/learner/attendance"
                    icon={CalendarDays}
                    title="Attendance"
                    description="Trends and recent days"
                  />
                  <QuickLink
                    href="/learner/report-cards"
                    icon={FileText}
                    title="Report cards"
                    description="Results and downloads"
                  />
                  <QuickLink
                    href="/learner/profile"
                    icon={UserRound}
                    title="Profile"
                    description="Details and contacts"
                  />
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
