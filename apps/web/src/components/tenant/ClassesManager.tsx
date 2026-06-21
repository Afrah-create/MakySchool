"use client";

import { useMemo, useState } from "react";
import { formatClassLabel } from "@makyschool/shared/constants";
import type { ClassWithDetails, SchoolType, SubjectWithDetails } from "@makyschool/shared/types";
import { AssignmentsTab } from "@/components/tenant/academic/AssignmentsTab";
import { ClassesTab } from "@/components/tenant/academic/ClassesTab";
import { SubjectsTab } from "@/components/tenant/academic/SubjectsTab";
import { AcademicSummaryCards, AcademicTabNav } from "@/components/tenant/academic/AcademicLayout";
import { StatusBanner } from "@makyschool/ui/components/ui/StatusBanner";
import { apiClient } from "@/lib/api/client";
import { parseAcademicError } from "@/lib/academic/feedback";
import { useDashboardMutation } from "@/hooks/useDashboardMutation";
import { useTenantSWR } from "@/hooks/useTenantSWR";

type AcademicTab = "classes" | "subjects" | "assignments";

export function ClassesManager({
  schoolType,
  schoolSlug,
}: {
  schoolType: SchoolType | null;
  schoolSlug: string;
}) {
  const [activeTab, setActiveTab] = useState<AcademicTab>("classes");

  const {
    data: classesData,
    error: classesError,
    isLoading: loadingClasses,
    isValidating: validatingClasses,
    mutate: mutateClasses,
  } = useTenantSWR<ClassWithDetails[]>("/schools/classes");

  const {
    data: subjectsData,
    error: subjectsError,
    isLoading: loadingSubjects,
    isValidating: validatingSubjects,
    mutate: mutateSubjects,
  } = useTenantSWR<SubjectWithDetails[]>("/schools/subjects");

  async function refreshAll() {
    await Promise.all([mutateClasses(), mutateSubjects()]);
  }

  const { loading, feedback, dismissFeedback, run } = useDashboardMutation({
    onSuccess: refreshAll,
    parseError: parseAcademicError,
  });

  const summary = useMemo(() => {
    const classes = classesData ?? [];
    const subjects = subjectsData ?? [];
    const students = classes.reduce((sum, row) => sum + (row.student_count ?? 0), 0);
    const needsAttention = classes.filter(
      (row) =>
        row.subjects.length === 0 ||
        (row.capacity != null && row.student_count >= row.capacity),
    ).length;

    return [
      { key: "classes", label: "Classes", value: classes.length, hint: "Levels & streams" },
      { key: "subjects", label: "Subjects", value: subjects.length, hint: "Across all levels" },
      { key: "students", label: "Enrolled", value: students, hint: "Total students" },
      {
        key: "attention",
        label: "Needs attention",
        value: needsAttention,
        hint: "Missing subjects or at capacity",
        tone: needsAttention > 0 ? ("warning" as const) : ("default" as const),
      },
    ];
  }, [classesData, subjectsData]);

  const tabs = useMemo(
    () => [
      { id: "classes" as const, label: "Classes", count: classesData?.length ?? 0 },
      { id: "subjects" as const, label: "Subjects", count: subjectsData?.length ?? 0 },
      { id: "assignments" as const, label: "Assignments" },
    ],
    [classesData?.length, subjectsData?.length],
  );

  async function createClass(values: {
    level: string;
    stream: string | null;
    capacity: number | null;
  }) {
    const label = formatClassLabel(values.level, values.stream);
    await run(async () => {
      await apiClient("/schools/classes", {
        method: "POST",
        body: values,
        schoolSlug,
      });
    }, `${label} created successfully.`);
  }

  async function updateClass(
    id: string,
    values: { level: string; stream: string | null; capacity: number | null },
  ) {
    const label = formatClassLabel(values.level, values.stream);
    await run(async () => {
      await apiClient(`/schools/classes/${id}`, {
        method: "PATCH",
        body: values,
        schoolSlug,
      });
    }, `${label} updated successfully.`);
  }

  async function deleteClass(classRow: ClassWithDetails) {
    const label = formatClassLabel(classRow.level, classRow.stream);
    await run(async () => {
      await apiClient(`/schools/classes/${classRow.id}`, {
        method: "DELETE",
        schoolSlug,
      });
    }, `${label} deleted successfully.`);
  }

  async function createSubject(name: string) {
    await run(async () => {
      await apiClient("/schools/subjects", {
        method: "POST",
        body: { name },
        schoolSlug,
      });
    }, `${name} added successfully.`);
  }

  async function updateSubject(id: string, name: string) {
    await run(async () => {
      await apiClient(`/schools/subjects/${id}`, {
        method: "PATCH",
        body: { name },
        schoolSlug,
      });
    }, `${name} updated successfully.`);
  }

  async function deleteSubject(subject: SubjectWithDetails) {
    await run(async () => {
      await apiClient(`/schools/subjects/${subject.id}`, {
        method: "DELETE",
        schoolSlug,
      });
    }, `${subject.name} deleted successfully.`);
  }

  async function toggleClassSubject(classId: string, subjectId: string, linked: boolean) {
    const classRow = classesData?.find((row) => row.id === classId);
    const subject = subjectsData?.find((row) => row.id === subjectId);
    const classLabel = classRow
      ? formatClassLabel(classRow.level, classRow.stream)
      : "class";
    const subjectName = subject?.name ?? "Subject";

    await run(async () => {
      await apiClient(
        linked
          ? `/schools/classes/${classId}/subjects/${subjectId}`
          : `/schools/classes/${classId}/subjects`,
        {
          method: linked ? "DELETE" : "POST",
          body: linked ? undefined : { subjectId },
          schoolSlug,
        },
      );
    }, linked
      ? `${subjectName} removed from ${classLabel}.`
      : `${subjectName} linked to ${classLabel}.`);
  }

  async function bulkLinkSubject(subjectId: string, classIds: string[]) {
    const subject = subjectsData?.find((row) => row.id === subjectId);
    const subjectName = subject?.name ?? "Subject";

    await run(async () => {
      await apiClient(`/schools/subjects/${subjectId}/classes`, {
        method: "PUT",
        body: { classIds },
        schoolSlug,
      });
    }, `${subjectName} linked to ${classIds.length} class${classIds.length === 1 ? "" : "es"}.`);
  }

  return (
    <div className="space-y-6">
      <AcademicSummaryCards items={summary} />

      <AcademicTabNav tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {feedback ? (
        <StatusBanner
          tone={feedback.tone}
          message={feedback.message}
          onDismiss={dismissFeedback}
          autoDismissMs={feedback.tone === "success" ? 5000 : undefined}
        />
      ) : null}

      {activeTab === "classes" ? (
        <ClassesTab
          schoolType={schoolType}
          classes={classesData}
          loading={loadingClasses}
          isValidating={validatingClasses}
          error={classesError}
          onRetry={() => void mutateClasses()}
          actionLoading={loading}
          onCreate={createClass}
          onUpdate={updateClass}
          onDelete={deleteClass}
        />
      ) : null}

      {activeTab === "subjects" ? (
        <SubjectsTab
          subjects={subjectsData}
          loading={loadingSubjects}
          isValidating={validatingSubjects}
          error={subjectsError}
          onRetry={() => void mutateSubjects()}
          actionLoading={loading}
          onCreate={createSubject}
          onUpdate={updateSubject}
          onDelete={deleteSubject}
        />
      ) : null}

      {activeTab === "assignments" ? (
        <AssignmentsTab
          schoolType={schoolType}
          classes={classesData}
          subjects={subjectsData}
          loadingClasses={loadingClasses}
          loadingSubjects={loadingSubjects}
          classesError={classesError}
          subjectsError={subjectsError}
          onRetry={() => {
            void mutateClasses();
            void mutateSubjects();
          }}
          actionLoading={loading}
          onToggleClassSubject={toggleClassSubject}
          onBulkLinkSubject={bulkLinkSubject}
        />
      ) : null}
    </div>
  );
}
