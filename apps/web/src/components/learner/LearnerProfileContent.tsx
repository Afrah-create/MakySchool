"use client";

import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { useApiSWR } from "@/hooks/useApiSWR";
import type { LearnerMe } from "@/lib/learner/types";
import {
  capitalizeGender,
  formatDobWithAge,
  studentInitials,
} from "@/lib/validation/students";

export function LearnerProfileContent() {
  const { data, error, isLoading, mutate } = useApiSWR<LearnerMe>("/schools/learner/me");

  return (
    <DashboardPage
      embedded
      maxWidth="5xl"
      eyebrow="Learner portal"
      title="Profile"
      description="Learner details and guardian contacts for this account."
    >
      <QueryState
        error={error}
        isLoading={isLoading}
        data={data}
        onRetry={() => void mutate()}
        loading={
          <div className="space-y-4">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-48" />
              <Skeleton className="h-48" />
            </div>
          </div>
        }
        isEmpty={() => false}
      >
        {(learner) => (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-theme bg-theme-surface p-5">
              {learner.photo_url ? (
                <img
                  src={learner.photo_url}
                  alt=""
                  className="h-16 w-16 rounded-2xl object-cover"
                />
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-theme-accent-muted text-lg font-semibold text-theme-accent">
                  {studentInitials(learner.full_name)}
                </span>
              )}
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-theme-primary">{learner.full_name}</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full border border-theme bg-theme-raised px-2.5 py-0.5 font-mono text-xs text-theme-primary">
                    {learner.learner_id}
                  </span>
                  {learner.class_name ? (
                    <span className="rounded-full bg-theme-accent-muted px-2.5 py-0.5 text-xs font-medium text-theme-accent">
                      {learner.class_name}
                    </span>
                  ) : null}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      learner.status === "active" ? "badge-success" : "badge-danger"
                    }`}
                  >
                    {learner.status === "active" ? "Active" : learner.status}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-theme bg-theme-surface p-5">
                <h3 className="text-sm font-semibold text-theme-primary">Personal details</h3>
                <dl className="mt-4 space-y-3 text-sm">
                  <div>
                    <dt className="text-theme-muted">Full name</dt>
                    <dd className="font-medium text-theme-primary">{learner.full_name}</dd>
                  </div>
                  <div>
                    <dt className="text-theme-muted">Date of birth</dt>
                    <dd>{formatDobWithAge(learner.date_of_birth)}</dd>
                  </div>
                  <div>
                    <dt className="text-theme-muted">Gender</dt>
                    <dd>{capitalizeGender(learner.gender)}</dd>
                  </div>
                  <div>
                    <dt className="text-theme-muted">Class</dt>
                    <dd>{learner.class_name ?? "—"}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-2xl border border-theme bg-theme-surface p-5">
                <h3 className="text-sm font-semibold text-theme-primary">Guardian contact</h3>
                <dl className="mt-4 space-y-3 text-sm">
                  <div>
                    <dt className="text-theme-muted">Name</dt>
                    <dd className="font-medium text-theme-primary">
                      {learner.guardian?.full_name ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-theme-muted">Relationship</dt>
                    <dd>
                      {learner.guardian?.relationship
                        ? learner.guardian.relationship.charAt(0).toUpperCase() +
                          learner.guardian.relationship.slice(1)
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-theme-muted">Phone</dt>
                    <dd>{learner.guardian?.phone ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-theme-muted">Email</dt>
                    <dd>{learner.guardian?.email ?? "—"}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-theme bg-theme-page px-5 py-4 text-sm text-theme-muted">
              Login uses learner ID <span className="font-mono text-theme-primary">{learner.learner_id}</span>.
              Parents and learners share this portal account. Contact the school office to reset the password.
            </div>
          </div>
        )}
      </QueryState>
    </DashboardPage>
  );
}
