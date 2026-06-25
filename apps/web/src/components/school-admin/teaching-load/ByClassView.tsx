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
import { diffSlotUpdates, slotKey, uniqueClasses } from "@/lib/teaching-load/utils";

function TeacherSelect({
  teachers,
  value,
  onChange,
  allowEmpty = true,
}: {
  teachers: TeachingLoadMatrix["teachers"];
  value: string | null;
  onChange: (teacherId: string | null) => void;
  allowEmpty?: boolean;
}) {
  const active = teachers.filter((t) => t.is_active);
  return (
    <select
      className="ms-input w-full max-w-xs text-sm"
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || null)}
    >
      {allowEmpty ? <option value="">Unassigned</option> : null}
      {active.map((teacher) => (
        <option key={teacher.id} value={teacher.id}>
          {teacher.full_name}
        </option>
      ))}
    </select>
  );
}

export function ByClassView({
  matrix,
  initialClassId,
  onSaved,
}: {
  matrix: TeachingLoadMatrix;
  initialClassId?: string | null;
  onSaved: () => void;
}) {
  const classes = useMemo(() => uniqueClasses(matrix.slots), [matrix.slots]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Map<string, string | null>>(new Map());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmPreview, setConfirmPreview] = useState<AssignmentSyncPreview | null>(null);

  const classSlots = useMemo((): TeachingLoadSlot[] => {
    if (!selectedClassId) return [];
    return matrix.slots.filter((slot) => slot.class_id === selectedClassId);
  }, [matrix.slots, selectedClassId]);

  useEffect(() => {
    if (!classes.length) return;
    const preferred =
      (initialClassId && classes.some((c) => c.id === initialClassId) ? initialClassId : null) ??
      selectedClassId ??
      classes[0]?.id;
    setSelectedClassId(preferred);
  }, [classes, initialClassId, selectedClassId]);

  useEffect(() => {
    const next = new Map<string, string | null>();
    for (const slot of classSlots) {
      next.set(slotKey(slot.class_id, slot.subject_id), slot.teacher_id ?? null);
    }
    setDraft(next);
    setConfirmPreview(null);
    setError(null);
  }, [classSlots]);

  const filteredClasses = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return classes;
    return classes.filter((item) => item.name.toLowerCase().includes(query));
  }, [classes, search]);

  const dirtyUpdates = useMemo(
    () => diffSlotUpdates(matrix.slots, draft),
    [draft, matrix.slots],
  );

  const selectedClass = classes.find((c) => c.id === selectedClassId);

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
          title="Classes"
          count={classes.length}
          searchPlaceholder="Search classes"
          searchValue={search}
          onSearchChange={setSearch}
        >
          {filteredClasses.map((item) => {
            const unassigned = matrix.slots.filter(
              (slot) => slot.class_id === item.id && !slot.teacher_id,
            ).length;
            return (
              <AssignmentPickerItem
                key={item.id}
                active={item.id === selectedClassId}
                title={item.name}
                subtitle={
                  unassigned > 0
                    ? `${unassigned} unassigned subject${unassigned === 1 ? "" : "s"}`
                    : "Fully staffed"
                }
                onClick={() => setSelectedClassId(item.id)}
              />
            );
          })}
        </AssignmentPickerPanel>
      }
      detail={
        <AssignmentDetailPanel
          title={selectedClass ? selectedClass.name : "Select a class"}
          description="Assign a teacher to each subject taught in this class."
          footer={
            <AssignmentSaveBar
              dirty={dirtyUpdates.length > 0}
              summary={
                dirtyUpdates.length > 0
                  ? `${dirtyUpdates.length} slot${dirtyUpdates.length === 1 ? "" : "s"} changed`
                  : "All subjects match the saved state."
              }
              saving={saving}
              onDiscard={() => {
                const next = new Map<string, string | null>();
                for (const slot of classSlots) {
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
                <th className="px-4 py-3 text-left">Subject</th>
                <th className="px-4 py-3 text-left">Teacher</th>
              </tr>
            </thead>
            <tbody>
              {classSlots.map((slot) => {
                const key = slotKey(slot.class_id, slot.subject_id);
                const value = draft.get(key) ?? slot.teacher_id ?? null;
                return (
                  <tr key={key} className="border-t border-theme">
                    <td className="px-4 py-3 font-medium text-theme-primary">{slot.subject_name}</td>
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
