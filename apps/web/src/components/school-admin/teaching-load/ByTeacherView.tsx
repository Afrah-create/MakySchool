"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { AssignmentSyncPreview, TeachingLoadMatrix } from "@makyschool/shared/types";
import {
  AssignmentDetailPanel,
  AssignmentPickerItem,
  AssignmentPickerPanel,
  AssignmentSaveBar,
  AssignmentSplitLayout,
} from "@/components/school-admin/academic/AssignmentLayout";
import { TeachingLoadConfirm } from "@/components/school-admin/teaching-load/TeachingLoadConfirm";
import { apiClient } from "@/lib/api/client";
import {
  parseSlotKey,
  slotKey,
  slotsForTeacher,
} from "@/lib/teaching-load/utils";

export function ByTeacherView({
  matrix,
  initialTeacherId,
  onSaved,
}: {
  matrix: TeachingLoadMatrix;
  initialTeacherId?: string | null;
  onSaved: () => void;
}) {
  const activeTeachers = useMemo(
    () => matrix.teachers.filter((teacher) => teacher.is_active),
    [matrix.teachers],
  );

  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmPreview, setConfirmPreview] = useState<AssignmentSyncPreview | null>(null);

  const selectedTeacher = activeTeachers.find((t) => t.id === selectedTeacherId) ?? null;

  useEffect(() => {
    if (!activeTeachers.length) return;
    const preferred =
      (initialTeacherId && activeTeachers.some((t) => t.id === initialTeacherId)
        ? initialTeacherId
        : null) ??
      selectedTeacherId ??
      activeTeachers[0]?.id;
    setSelectedTeacherId(preferred);
  }, [activeTeachers, initialTeacherId, selectedTeacherId]);

  useEffect(() => {
    if (!selectedTeacherId) return;
    const assigned = new Set(
      slotsForTeacher(matrix.slots, selectedTeacherId).map((slot) =>
        slotKey(slot.class_id, slot.subject_id),
      ),
    );
    setSelectedKeys(assigned);
    setConfirmPreview(null);
    setError(null);
  }, [matrix.slots, selectedTeacherId]);

  const filteredTeachers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return activeTeachers;
    return activeTeachers.filter((teacher) => teacher.full_name.toLowerCase().includes(query));
  }, [activeTeachers, search]);

  const baselineKeys = useMemo(() => {
    if (!selectedTeacherId) return new Set<string>();
    return new Set(
      slotsForTeacher(matrix.slots, selectedTeacherId).map((slot) =>
        slotKey(slot.class_id, slot.subject_id),
      ),
    );
  }, [matrix.slots, selectedTeacherId]);

  const dirty = useMemo(() => {
    if (baselineKeys.size !== selectedKeys.size) return true;
    for (const key of baselineKeys) {
      if (!selectedKeys.has(key)) return true;
    }
    return false;
  }, [baselineKeys, selectedKeys]);

  const toggleSlot = useCallback((classId: string, subjectId: string) => {
    const key = slotKey(classId, subjectId);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setConfirmPreview(null);
  }, []);

  async function save(acknowledgeWarnings = false) {
    if (!selectedTeacherId) return;

    const updates: Array<{ class_id: string; subject_id: string; teacher_id: string | null }> = [];

    for (const key of baselineKeys) {
      if (!selectedKeys.has(key)) {
        const { classId, subjectId } = parseSlotKey(key);
        updates.push({ class_id: classId, subject_id: subjectId, teacher_id: null });
      }
    }

    for (const key of selectedKeys) {
      if (!baselineKeys.has(key)) {
        const { classId, subjectId } = parseSlotKey(key);
        updates.push({
          class_id: classId,
          subject_id: subjectId,
          teacher_id: selectedTeacherId,
        });
      }
    }

    if (updates.length === 0) return;

    setSaving(true);
    setError(null);

    try {
      await apiClient<TeachingLoadMatrix>("/schools/teaching-load/slots", {
        method: "PATCH",
        body: {
          slots: updates,
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
          Link subjects to classes
        </Link>{" "}
        under Classes → Subject placement first.
      </div>
    );
  }

  return (
    <AssignmentSplitLayout
      picker={
        <AssignmentPickerPanel
          title="Teachers"
          count={activeTeachers.length}
          searchPlaceholder="Search teachers"
          searchValue={search}
          onSearchChange={setSearch}
        >
          {filteredTeachers.map((teacher) => (
            <AssignmentPickerItem
              key={teacher.id}
              active={teacher.id === selectedTeacherId}
              title={teacher.full_name}
              subtitle={
                teacher.slot_count === 0
                  ? "No teaching load"
                  : `${teacher.slot_count} slot${teacher.slot_count === 1 ? "" : "s"}`
              }
              badge={matrix.teachers_without_load.includes(teacher.id) ? "!" : undefined}
              onClick={() => setSelectedTeacherId(teacher.id)}
            />
          ))}
        </AssignmentPickerPanel>
      }
      detail={
        <AssignmentDetailPanel
          title={selectedTeacher ? selectedTeacher.full_name : "Select a teacher"}
          description="Check the class subjects this teacher should lead. Only subjects in your curriculum are listed."
          stats={
            selectedTeacher ? (
              <p className="text-xs text-theme-muted">
                {selectedKeys.size} of {matrix.slots.length} curriculum slots selected
              </p>
            ) : null
          }
          footer={
            <AssignmentSaveBar
              dirty={dirty}
              summary={
                dirty
                  ? "You have unsaved teaching load changes."
                  : "Teaching load matches the saved state."
              }
              saving={saving}
              onDiscard={() => setSelectedKeys(new Set(baselineKeys))}
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
                <th className="px-4 py-3 text-left">Assign</th>
                <th className="px-4 py-3 text-left">Class</th>
                <th className="px-4 py-3 text-left">Subject</th>
                <th className="px-4 py-3 text-left">Current teacher</th>
              </tr>
            </thead>
            <tbody>
              {matrix.slots.map((slot) => {
                const key = slotKey(slot.class_id, slot.subject_id);
                const checked = selectedKeys.has(key);
                const occupiedByOther =
                  slot.teacher_id && slot.teacher_id !== selectedTeacherId && !checked;

                return (
                  <tr key={key} className="border-t border-theme">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!selectedTeacherId}
                        onChange={() => toggleSlot(slot.class_id, slot.subject_id)}
                        aria-label={`Assign ${slot.subject_name} in ${slot.class_name}`}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-theme-primary">{slot.class_name}</td>
                    <td className="px-4 py-3 text-theme-muted">{slot.subject_name}</td>
                    <td className="px-4 py-3 text-sm text-theme-muted">
                      {occupiedByOther ? (
                        <span className="text-amber-700 dark:text-amber-200">
                          {slot.teacher_name} (will be replaced)
                        </span>
                      ) : slot.teacher_name ? (
                        slot.teacher_name
                      ) : (
                        <span className="text-theme-faint">Unassigned</span>
                      )}
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
