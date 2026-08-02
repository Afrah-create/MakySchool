"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { useTeacherOLevelAssignments } from "@/hooks/useOLevel";

export function TeacherOLevelOverview() {
  const { data: assignments = [], isPending } = useTeacherOLevelAssignments();

  return (
    <DashboardPage
      embedded
      maxWidth="7xl"
      eyebrow="O-Level"
      title="O-Level marks"
      description="Open assessment sessions for classes you teach. Each sheet covers all your subjects in that class."
    >
      {!isPending && !assignments.length ? (
        <EmptyState
          icon={ClipboardList}
          title="No O-Level assignments"
          description="When an administrator opens a session for a class you teach, it will appear here."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {assignments.map((a) => (
            <Link
              key={a.examSessionId}
              href={`/teacher/olevel/marks?session=${a.examSessionId}`}
              className="rounded-xl border border-theme bg-theme-surface p-5 transition hover:border-theme-accent"
            >
              <div className="flex justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-theme-primary">{a.title}</h2>
                  <p className="mt-1 text-sm text-theme-muted">
                    {a.className} · {a.termName} · {a.categoryName}
                  </p>
                  <p className="mt-2 text-sm text-theme-muted">
                    {a.subjects.map((s) => s.code || s.name).join(" · ")}
                  </p>
                </div>
                <span className="h-fit rounded-full bg-theme-raised px-2.5 py-1 text-xs capitalize text-theme-muted">
                  {a.submissionStatus}
                </span>
              </div>
              <p className="mt-4 text-sm text-theme-muted">
                {a.enteredCount}/{a.studentCount} marks entered · {a.subjects.length}{" "}
                subject{a.subjects.length === 1 ? "" : "s"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </DashboardPage>
  );
}
