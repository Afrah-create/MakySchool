"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { AssignmentSyncPreview, TeachingLoadMatrix, TeachingLoadSlot } from "@makyschool/shared/types";
import {
  AssignmentDetailPanel,
  AssignmentPickerItem,
  AssignmentPickerPanel,
  AssignmentSaveBar,
  AssignmentSplitLayout,
} from "@/components/school-admin/academic/AssignmentLayout";
import { TeachingLoadConfirm } from "@/components/school-admin/teaching-load/TeachingLoadConfirm";
import { apiClient } from "@/lib/api/client";
import { diffSlotUpdates, slotKey, uniqueSubjects } from "@/lib/teaching-load/utils";

function TeacherSelect({
  teachers,
  value,
  onChange,
}: {
  teachers: TeachingLoadMatrix["teachers"];
  value: string | null;
  onChange: (teacherId: string | null) => void;
}) {
  const active = teachers.filter((t) => t.is_active);
  return (
    <select
      className="ms-input w-full max-w-xs text-sm"
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || null)}
    >
      <option value="">Unassigned</option>
      {active.map((teacher) => (
        <option key={teacher.id} value={teacher.id}>
          {teacher.full_name}
        </option>
      ))}
    </select>
  );
}

export function BySubjectView({
  matrix,
  initialSubjectId,
  onSaved,
}: {
  matrix: TeachingLoadMatrix;
  initialSubjectId?: string | null;
  onSaved: () => void;
}) {
  const subjects = useMemo(() => uniqueSubjects(matrix.slots), [matrix.slots]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Map<string, string | null>>(new Map());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmPreview, setConfirmPreview] = useState<AssignmentSyncPreview | null>(null);

  const subjectSlots = useMemo(() => {
    if (!selectedSubjectId) return [] as TeachingLoadSlot[];
    return matrix.slots.filter((slot) => slot.subject_id === selectedSubjectId);
  }, [matrix.slots, selectedSubjectId]);

  useEffect(() => {
    if (!subjects.length) return;
    const preferred =
      (initialSubjectId && subjects.some((s) => s.id === initialSubjectId)
        ? initialSubjectId
        : null) ??
      selectedSubjectId ??
      subjects[0]?.id;
    setSelectedSubjectId(preferred);
  }, [subjects, initialSubjectId, selectedSubjectId]);

  useEffect(() => {
    const next = new Map<string, string | null>();
    for (const slot of subjectSlots) {
      next.set(slotKey(slot.class_id, slot.subject_id), slot.teacher_id ?? null);
    }
    setDraft(next);
    setConfirmPreview(null);
    setError(null);
  }, [subjectSlots]);

  const filteredSubjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return subjects;
    return subjects.filter((item) => item.name.toLowerCase().includes(query));
  }, [subjects, search]);

  const dirtyUpdates = useMemo(
    () => diffSlotUpdates(matrix.slots, draft),
    [draft, matrix.slots],
  );

  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId);

  function setSlotTeacher(classId: string, subjectId: string, teacherId: string | null) {
    const key = slotKey(classId, subjectId);
    setDraft((current) => {
      const next = new Map(current);
      next.set(key, teacherId);
      return next;
    });
    setConfirmPreview(null);
  }

  async function save(acknowledgeWarnings = false) {
    if (dirtyUpdates.length === 0) return;
    setSaving(true);
    setError(null);

    try {
      await apiClient<TeachingLoadMatrix>("/schools/teaching-load/slots", {
        method: "PATCH",
        body: {
          slots: dirtyUpdates,
          acknowledge_assignment_warnings: acknowledgeWarnings,
        },
      });
      setConfirmPreview(null);
      onSaved();
    } catch (err) {
      const requestError = err as Error & {
        code?: string;
        preview?: AssignmentSyncPreview;
      };
      if (requestError.code === "ASSIGNMENT_CONFIRM_REQUIRED") {
        setConfirmPreview(requestError.preview ?? { warnings: [], blocks: [] });
        return;
      }
      setError(requestError.message);
      setConfirmPreview(null);
    } finally {
      setSaving(false);
    }
  }

  if (matrix.slots.length === 0) {
    return (
      <div className="ms-card p-6 text-sm text-theme-muted">
        No curriculum slots yet.{" "}
        <Link href="/dashboard/classes" className="text-theme-accent hover:underline">
          Set up subject placement
        </Link>{" "}
        first.
      </div>
    );
  }

  return (
    <AssignmentSplitLayout
      picker={
        <AssignmentPickerPanel
          title="Subjects"
          count={subjects.length}
          searchPlaceholder="Search subjects"
          searchValue={search}
          onSearchChange={setSearch}
        >
          {filteredSubjects.map((item) => {
            const unassigned = matrix.slots.filter(
              (slot) => slot.subject_id === item.id && !slot.teacher_id,
            ).length;
            return (
              <AssignmentPickerItem
                key={item.id}
                active={item.id === selectedSubjectId}
                title={item.name}
                subtitle={
                  unassigned > 0
                    ? `${unassigned} unassigned class${unassigned === 1 ? "" : "es"}`
                    : "Fully staffed"
                }
                onClick={() => setSelectedSubjectId(item.id)}
              />
            );
          })}
        </AssignmentPickerPanel>
      }
      detail={
        <AssignmentDetailPanel
          title={selectedSubject ? selectedSubject.name : "Select a subject"}
          description="Assign a teacher for this subject in each class where it is taught."
          footer={
            <AssignmentSaveBar
              dirty={dirtyUpdates.length > 0}
              summary={
                dirtyUpdates.length > 0
                  ? `${dirtyUpdates.length} slot${dirtyUpdates.length === 1 ? "" : "s"} changed`
                  : "All classes match the saved state."
              }
              saving={saving}
              onDiscard={() => {
                const next = new Map<string, string | null>();
                for (const slot of subjectSlots) {
                  next.set(slotKey(slot.class_id, slot.subject_id), slot.teacher_id ?? null);
                }
                setDraft(next);
              }}
              onSave={() => void save(false)}
            />
          }
        >
          {error ? (
            <div className="border-b border-theme bg-theme-danger-bg px-5 py-3 text-sm text-theme-danger">
              {error}
            </div>
          ) : null}

          {confirmPreview ? (
            <div className="p-5">
              <TeachingLoadConfirm
                preview={confirmPreview}
                loading={saving}
                onCancel={() => setConfirmPreview(null)}
                onConfirm={() => void save(true)}
              />
            </div>
          ) : null}

          <table className="ms-table w-full">
            <thead className="bg-table-header text-xs font-medium uppercase tracking-wide text-theme-muted">
              <tr>
                <th className="px-4 py-3 text-left">Class</th>
                <th className="px-4 py-3 text-left">Teacher</th>
              </tr>
            </thead>
            <tbody>
              {subjectSlots.map((slot) => {
                const key = slotKey(slot.class_id, slot.subject_id);
                const value = draft.get(key) ?? slot.teacher_id ?? null;
                return (
                  <tr key={key} className="border-t border-theme">
                    <td className="px-4 py-3 font-medium text-theme-primary">{slot.class_name}</td>
                    <td className="px-4 py-3">
                      <TeacherSelect
                        teachers={matrix.teachers}
                        value={value}
                        onChange={(teacherId) =>
                          setSlotTeacher(slot.class_id, slot.subject_id, teacherId)
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </AssignmentDetailPanel>
      }
    />
  );
}
