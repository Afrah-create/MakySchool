"use client";

import { getLevelsForSchoolType } from "@makyschool/shared/constants";
import type { ClassRecord, SchoolType } from "@makyschool/shared/types";
import { SlideOver } from "@makyschool/ui/components/ui/SlideOver";

type ClassFormSlideOverProps = {
  open: boolean;
  schoolType: SchoolType | null;
  initial?: Pick<ClassRecord, "level" | "stream" | "capacity"> | null;
  loading: boolean;
  onClose: () => void;
  onSubmit: (values: { level: string; stream: string | null; capacity: number | null }) => void;
};

export function ClassFormSlideOver({
  open,
  schoolType,
  initial,
  loading,
  onClose,
  onSubmit,
}: ClassFormSlideOverProps) {
  const levels = getLevelsForSchoolType(schoolType);
  const isEdit = Boolean(initial);

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit class" : "Add class"}
      description="Choose a level and optional stream. Only levels for your school type are shown."
      footer={
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="ms-btn-ghost rounded-xl px-4 py-2">
            Cancel
          </button>
          <button
            type="submit"
            form="class-form"
            disabled={loading}
            className="ms-btn-primary rounded-xl px-4 py-2"
          >
            {isEdit ? "Save changes" : "Create class"}
          </button>
        </div>
      }
    >
      <form
        id="class-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          onSubmit({
            level: String(formData.get("level") ?? ""),
            stream: String(formData.get("stream") ?? "").trim() || null,
            capacity: formData.get("capacity")
              ? Number(formData.get("capacity"))
              : null,
          });
        }}
      >
        <div>
          <label htmlFor="class-level" className="mb-1.5 block text-sm font-medium text-theme-primary">
            Level
          </label>
          <select
            id="class-level"
            name="level"
            required
            defaultValue={initial?.level ?? ""}
            className="ms-select w-full"
          >
            <option value="">Select level</option>
            {levels.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="class-stream" className="mb-1.5 block text-sm font-medium text-theme-primary">
            Stream
          </label>
          <input
            id="class-stream"
            name="stream"
            defaultValue={initial?.stream ?? ""}
            placeholder="e.g. A, B, C"
            className="ms-input w-full"
          />
          <p className="mt-1.5 text-xs text-theme-muted">
            Combined with level to form the class name, e.g. P3A.
          </p>
        </div>

        <div>
          <label htmlFor="class-capacity" className="mb-1.5 block text-sm font-medium text-theme-primary">
            Capacity
          </label>
          <input
            id="class-capacity"
            name="capacity"
            type="number"
            min={1}
            defaultValue={initial?.capacity ?? ""}
            placeholder="Optional max students"
            className="ms-input w-full"
          />
        </div>
      </form>
    </SlideOver>
  );
}
