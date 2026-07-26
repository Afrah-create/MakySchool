"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Users } from "lucide-react";
import type { TeacherDetail } from "@/lib/teachers/types";
import { buildTeacherClassMap, marksStatusBadgeClass } from "@/lib/teacher/utils";
import { marksStatusLabel } from "@/lib/validation/teachers";

export function TeacherClassCard({
  classId,
  assignments,
  submissionStatus,
  studentCount,
}: {
  classId: string;
  assignments: TeacherDetail["assignments"];
  submissionStatus: TeacherDetail["submission_status"];
  studentCount?: number;
}) {
  const className = assignments[0]?.class_name ?? "Class";
  const subjects = assignments.map((item) => item.subject_name).filter(Boolean);
  const submission = submissionStatus.find((item) => item.class_name === className);

  return (
    <div className="flex h-full flex-col rounded-xl border border-theme bg-theme-surface p-5 transition hover:border-accent-soft">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-theme-primary">{className}</h3>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${marksStatusBadgeClass(submission?.status)}`}
        >
          {submission ? marksStatusLabel(submission.status) : "Pending"}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {subjects.length > 0 ? (
          subjects.map((name) => (
            <span key={name} className="badge-info rounded-full px-2.5 py-0.5 text-xs font-medium">
              {name}
            </span>
          ))
        ) : (
          <span className="text-xs text-theme-muted">No subjects assigned</span>
        )}
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-sm text-theme-muted">
        <Users className="h-4 w-4 shrink-0" />
        {typeof studentCount === "number"
          ? `${studentCount} student${studentCount === 1 ? "" : "s"}`
          : "Open class to view students"}
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-3 pt-5">
        <Link
          href={`/teacher/classes/${classId}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-theme-accent hover:underline"
        >
          View class
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href={`/teacher/attendance?classId=${classId}`}
          className="text-sm font-medium text-theme-muted hover:text-theme-accent"
        >
          Attendance
        </Link>
      </div>
    </div>
  );
}

export function TeacherClassGrid({
  teacher,
  limit,
}: {
  teacher: TeacherDetail;
  limit?: number;
}) {
  const classMap = buildTeacherClassMap(teacher.assignments);
  const entries = [...classMap.entries()];
  const visible = limit ? entries.slice(0, limit) : entries;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map(([classId, assignments]) => (
        <TeacherClassCard
          key={classId}
          classId={classId}
          assignments={assignments}
          submissionStatus={teacher.submission_status}
          studentCount={teacher.class_student_counts?.[classId]}
        />
      ))}
    </div>
  );
}

export function TeacherStatsRow({ teacher }: { teacher: TeacherDetail }) {
  const classCount = buildTeacherClassMap(teacher.assignments).size;

  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
      <div className="min-w-[10.5rem] flex-1 rounded-2xl border border-theme bg-theme-surface p-3.5 sm:min-w-0 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-theme-accent-muted text-theme-accent sm:h-10 sm:w-10">
            <BookOpen className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <div>
            <p className="text-[11px] text-theme-muted sm:text-xs">Assigned classes</p>
            <p className="text-xl font-semibold tabular-nums text-theme-primary sm:text-2xl">
              {classCount}
            </p>
          </div>
        </div>
      </div>
      <div className="min-w-[10.5rem] flex-1 rounded-2xl border border-theme bg-theme-surface p-3.5 sm:min-w-0 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-theme-icon text-theme-muted sm:h-10 sm:w-10">
            <Users className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <div>
            <p className="text-[11px] text-theme-muted sm:text-xs">My students</p>
            <p className="text-xl font-semibold tabular-nums text-theme-primary sm:text-2xl">
              {teacher.total_students > 0 ? teacher.total_students : "—"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
