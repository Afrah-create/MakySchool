"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { getLevelsForSchoolType } from "@makyschool/shared/constants";
import type { ClassWithDetails } from "@makyschool/shared/types";
import { apiClient } from "@/lib/api/client";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

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
        <div className="lg:col-span-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {actionError}
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Add Class</h2>
          <form action={(formData) => void addClass(formData)} className="mt-4 space-y-3">
            <select name="level" required className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm">
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
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
            />
            <input
              name="capacity"
              type="number"
              placeholder="Capacity"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
            />
            <button
              disabled={loading}
              type="submit"
              className="rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-70"
            >
              Create Class
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Classes</h2>
            <Badge tone="info">{classesData?.length ?? 0}</Badge>
          </div>
          {loadingClasses ? (
            <Skeleton className="mt-4 h-40" />
          ) : classesError ? (
            <EmptyState title="Classes unavailable" description="Unable to load the class list right now." />
          ) : classesData?.length === 0 ? (
            <EmptyState title="No classes yet" description="Create your first class to start linking subjects." />
          ) : (
            <div className="mt-4 space-y-3">
              {classesData?.map((classRow) => (
                <button
                  key={classRow.id}
                  type="button"
                  onClick={() => setSelectedClassId(classRow.id)}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                    selectedClass?.id === classRow.id
                      ? "border-indigo-700 bg-indigo-700 text-white"
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">
                        {classRow.level}
                        {classRow.stream ?? ""}
                      </div>
                      <div
                        className={`text-sm ${
                          selectedClass?.id === classRow.id ? "text-indigo-100" : "text-slate-500"
                        }`}
                      >
                        {classRow.student_count} students
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={classRow.student_count > 0}
                      onClick={(event) => {
                        event.stopPropagation();
                        setConfirmDelete(classRow);
                      }}
                      className="rounded-xl border border-current px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Subject List</h2>
            <p className="text-sm text-slate-500">
              Link subjects to{" "}
              {selectedClass ? `${selectedClass.level}${selectedClass.stream ?? ""}` : "a class"}.
            </p>
          </div>
          <Badge tone="neutral">{subjectsData?.length ?? 0}</Badge>
        </div>

        <form action={(formData) => void addSubject(formData)} className="flex gap-3">
          <input
            name="name"
            required
            placeholder="New subject name"
            className="flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
          />
          <button
            disabled={loading}
            type="submit"
            className="rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-70"
          >
            Add Subject
          </button>
        </form>

        {subjectsData?.length === 0 ? (
          <EmptyState title="No subjects yet" description="Add subjects before linking them to classes." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {subjectsData?.map((subject) => {
              const linked = Boolean(
                selectedClass?.subjects.some((item) => item.id === subject.id),
              );
              return (
                <label
                  key={subject.id}
                  className="flex cursor-pointer items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                >
                  <span>{subject.name}</span>
                  <input
                    type="checkbox"
                    checked={linked}
                    disabled={!selectedClass || loading}
                    onChange={() => void toggleSubject(subject.id, linked)}
                  />
                </label>
              );
            })}
          </div>
        )}
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
          <p className="text-sm text-rose-700">
            This class cannot be deleted until all students are moved out.
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
