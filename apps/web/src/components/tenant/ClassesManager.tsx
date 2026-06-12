"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { getLevelsForSchoolType } from "@makyschool/shared/constants";
import type { ClassWithDetails } from "@makyschool/shared/types";
import { apiClient } from "@/lib/api/client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Skeleton } from "@/components/ui/Skeleton";

function DarkEmpty({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-theme bg-input px-4 py-8 text-center">
      <p className="text-sm font-medium text-theme-primary">{title}</p>
      <p className="mt-1 text-sm text-theme-muted">{description}</p>
    </div>
  );
}

export function ClassesManager({
  schoolType,
  schoolSlug,
}: {
  schoolType: string | null;
  schoolSlug: string;
}) {
  const {
    data: classesData,
    error: classesError,
    isLoading: loadingClasses,
    mutate: mutateClasses,
  } = useSWR(
    ["/schools/classes", schoolSlug],
    ([path, slug]) => apiClient<ClassWithDetails[]>(path, { schoolSlug: slug }).then((r) => r.data),
  );

  const { data: subjectsData, mutate: mutateSubjects } = useSWR(
    ["/schools/subjects", schoolSlug],
    ([path, slug]) =>
      apiClient<Array<{ id: string; name: string }>>(path, { schoolSlug: slug }).then((r) => r.data),
  );

  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ClassWithDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const selectedClass = useMemo(
    () => classesData?.find((item) => item.id === selectedClassId) ?? classesData?.[0] ?? null,
    [classesData, selectedClassId],
  );

  const levels = getLevelsForSchoolType(schoolType);

  async function addClass(formData: FormData) {
    setLoading(true);
    setActionError(null);
    try {
      await apiClient("/schools/classes", {
        method: "POST",
        body: {
          level: String(formData.get("level") ?? ""),
          stream: String(formData.get("stream") ?? "") || null,
          capacity: formData.get("capacity") ? Number(formData.get("capacity")) : null,
        },
        schoolSlug,
      });
      await mutateClasses();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to create class");
    } finally {
      setLoading(false);
    }
  }

  async function addSubject(formData: FormData) {
    setLoading(true);
    setActionError(null);
    try {
      await apiClient("/schools/subjects", {
        method: "POST",
        body: { name: String(formData.get("name") ?? "") },
        schoolSlug,
      });
      await mutateSubjects();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to create subject");
    } finally {
      setLoading(false);
    }
  }

  async function toggleSubject(subjectId: string, linked: boolean) {
    if (!selectedClass) return;
    setLoading(true);
    setActionError(null);
    try {
      await apiClient(
        linked
          ? `/schools/classes/${selectedClass.id}/subjects/${subjectId}`
          : `/schools/classes/${selectedClass.id}/subjects`,
        {
          method: linked ? "DELETE" : "POST",
          body: linked ? undefined : { subjectId },
          schoolSlug,
        },
      );
      await mutateClasses();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to update subject link");
    } finally {
      setLoading(false);
    }
  }

  async function deleteClass(classRow: ClassWithDetails) {
    if (classRow.student_count > 0) {
      setActionError(
        `Cannot delete ${classRow.level}${classRow.stream ?? ""}. ${classRow.student_count} students are currently enrolled.`,
      );
      setConfirmDelete(null);
      return;
    }

    setLoading(true);
    setActionError(null);
    try {
      await apiClient(`/schools/classes/${classRow.id}`, { method: "DELETE", schoolSlug });
      await mutateClasses();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to delete class");
    } finally {
      setConfirmDelete(null);
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_1.4fr]">
      {actionError ? (
        <div className="lg:col-span-2 alert-error rounded-lg px-4 py-3 text-sm">
          {actionError}
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="ms-panel p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-theme-primary">Add class</h2>
          <form action={(formData) => void addClass(formData)} className="mt-4 space-y-3">
            <select name="level" required className="ms-select w-full">
              <option value="">Select level</option>
              {levels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
            <input
              name="stream"
              placeholder="Stream (optional)"
              className="ms-input"
            />
            <input
              name="capacity"
              type="number"
              placeholder="Capacity"
              className="ms-input"
            />
            <button disabled={loading} type="submit" className="ms-btn-primary">
              Create class
            </button>
          </form>
        </div>

        <div className="ms-panel p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-theme-primary">Classes</h2>
            <span className="badge-info rounded-full px-2.5 py-0.5 text-xs font-medium">
              {classesData?.length ?? 0}
            </span>
          </div>
          {loadingClasses ? (
            <Skeleton className="mt-4 h-40 rounded-xl" />
          ) : classesError ? (
            <div className="mt-4">
              <DarkEmpty title="Classes unavailable" description="Unable to load the class list right now." />
            </div>
          ) : classesData?.length === 0 ? (
            <div className="mt-4">
              <DarkEmpty title="No classes yet" description="Create your first class to start linking subjects." />
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {classesData?.map((classRow) => (
                <div
                  key={classRow.id}
                  className={`rounded-xl border px-4 py-3 transition ${
                    selectedClass?.id === classRow.id
                      ? "border-accent-soft bg-theme-accent-muted"
                      : "border-theme bg-input hover:border-theme-strong"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedClassId(classRow.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="font-medium text-theme-primary">
                        {classRow.level}
                        {classRow.stream ?? ""}
                      </div>
                      <div className="text-sm text-theme-muted">
                        {classRow.student_count} students
                      </div>
                    </button>
                    <button
                      type="button"
                      disabled={classRow.student_count > 0}
                      onClick={() => setConfirmDelete(classRow)}
                      className="ms-btn-ghost px-3 py-1.5 text-xs disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="ms-panel p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-theme-primary">Subjects</h2>
            <p className="mt-1 text-sm text-theme-muted">
              Link subjects to{" "}
              {selectedClass ? `${selectedClass.level}${selectedClass.stream ?? ""}` : "a class"}.
            </p>
          </div>
          <span className="badge-info rounded-full px-2.5 py-0.5 text-xs font-medium">
            {subjectsData?.length ?? 0}
          </span>
        </div>

        <form action={(formData) => void addSubject(formData)} className="mt-4 flex gap-3">
          <input
            name="name"
            required
            placeholder="New subject name"
            className="ms-input flex-1"
          />
          <button disabled={loading} type="submit" className="ms-btn-primary shrink-0">
            Add
          </button>
        </form>

        <div className="mt-4">
          {subjectsData?.length === 0 ? (
            <DarkEmpty title="No subjects yet" description="Add subjects before linking them to classes." />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {subjectsData?.map((subject) => {
                const linked = Boolean(
                  selectedClass?.subjects.some((item) => item.id === subject.id),
                );
                return (
                  <label
                    key={subject.id}
                    className={`flex cursor-pointer items-center justify-between rounded-lg border px-4 py-3 text-sm transition ${
                      linked
                        ? "border-accent-soft bg-theme-accent-muted text-theme-primary"
                        : "border-theme bg-input text-theme-muted hover:border-theme-strong"
                    }`}
                  >
                    <span>{subject.name}</span>
                    <input
                      type="checkbox"
                      checked={linked}
                      disabled={!selectedClass || loading}
                      onChange={() => void toggleSubject(subject.id, linked)}
                      className="accent-theme"
                    />
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete class"
        description={
          confirmDelete
            ? `${confirmDelete.level}${confirmDelete.stream ?? ""} has ${confirmDelete.student_count} students.`
            : ""
        }
        confirmLabel="Delete class"
        onConfirm={() => {
          if (confirmDelete) {
            void deleteClass(confirmDelete);
          }
        }}
        onCancel={() => setConfirmDelete(null)}
      >
        {confirmDelete?.student_count ? (
          <p className="alert-error rounded-lg px-3 py-2 text-sm">
            This class cannot be deleted until all students are moved out.
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
