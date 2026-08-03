"use client";

import { useEffect, useState } from "react";
import { Mail, Phone, UserRound } from "lucide-react";
import { Modal } from "@makyschool/ui/components/ui/Modal";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { apiClient } from "@/lib/api/client";
import type { TeacherDetail } from "@/lib/teachers/types";
import {
  teacherInitials,
  validateTeacherProfileFields,
} from "@/lib/validation/teachers";
import { useToast } from "@/providers/ToastProvider";
import { SubjectSpecializationSelect } from "./SubjectSpecializationSelect";

export function EditTeacherPanel({
  teacher,
  onClose,
  onSaved,
}: {
  teacher: TeacherDetail | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = Boolean(teacher);
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!teacher) return;
    setFullName(teacher.full_name);
    setPhone(teacher.phone ?? "");
    setSpecialization(teacher.subject_specialization ?? "");
    setErrors({});
    setBannerError(null);
  }, [teacher]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!teacher) return;

    const clientErrors = validateTeacherProfileFields({
      full_name: fullName,
      phone,
    });
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;

    setLoading(true);
    setBannerError(null);

    try {
      await apiClient<TeacherDetail>(`/schools/teachers/${teacher.id}`, {
        method: "PATCH",
        body: {
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          subject_specialization: specialization.trim() || null,
        },
      });
      toast.success(`Changes saved for ${fullName.trim()}.`);
      onSaved();
      onClose();
    } catch (error) {
      const err = error as Error & { fields?: Record<string, string> };
      if (err.fields) setErrors(err.fields);
      setBannerError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={teacher ? `Edit ${teacher.full_name}` : "Edit teacher"}
      description="Update profile details. Assign classes and subjects from Teaching load."
    >
      {teacher ? (
        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5">
          <div className="flex items-center gap-3 rounded-xl border border-theme bg-theme-raised/40 px-4 py-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-theme-accent-muted text-sm font-semibold text-theme-accent">
              {teacherInitials(teacher.full_name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-theme-primary">
                {teacher.full_name}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-theme-muted">
                <Mail className="h-3 w-3 shrink-0" />
                {teacher.email}
              </p>
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-theme-muted">
              <UserRound className="h-3.5 w-3.5" />
              Full name *
            </span>
            <input
              className="ms-input w-full"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                if (errors.full_name) {
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.full_name;
                    return next;
                  });
                }
              }}
              autoComplete="name"
            />
            {errors.full_name ? (
              <p className="mt-1.5 text-xs text-theme-danger">{errors.full_name}</p>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-theme-muted">
              <Phone className="h-3.5 w-3.5" />
              Phone number
            </span>
            <input
              className="ms-input w-full"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (errors.phone) {
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.phone;
                    return next;
                  });
                }
              }}
              placeholder="Optional"
              autoComplete="tel"
            />
            {errors.phone ? (
              <p className="mt-1.5 text-xs text-theme-danger">{errors.phone}</p>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-theme-muted">
              Subject specialisation
            </span>
            <SubjectSpecializationSelect
              value={specialization}
              onChange={setSpecialization}
            />
          </label>

          <p className="text-xs leading-relaxed text-theme-muted">
            Email cannot be changed after account creation. Use Teaching load
            for class and subject assignments.
          </p>

          {bannerError ? (
            <div className="rounded-xl bg-theme-danger-bg px-3.5 py-2.5 text-sm text-theme-danger">
              {bannerError}
            </div>
          ) : null}

          <div className="flex justify-end gap-3 border-t border-theme pt-4">
            <button
              type="button"
              className="ms-btn-ghost"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <LoadingButton type="submit" loading={loading}>
              Save changes
            </LoadingButton>
          </div>
        </form>
      ) : null}
    </Modal>
  );
}
