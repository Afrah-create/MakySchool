"use client";

import { useEffect, useState } from "react";
import { Modal } from "@makyschool/ui/components/ui/Modal";
import { apiClient } from "@/lib/api/client";
import type { TeacherDetail } from "@/lib/teachers/types";
import { validateTeacherForm } from "@/lib/validation/teachers";
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

    const clientErrors = validateTeacherForm({ full_name: fullName, phone });
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
          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Email</span>
            <p className="text-sm text-theme-primary">{teacher.email}</p>
            <p className="mt-1 text-xs text-theme-faint">
              Email cannot be changed after account creation.
            </p>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Full name *</span>
            <input
              className="ms-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            {errors.full_name ? (
              <p className="mt-1 text-xs text-theme-danger">{errors.full_name}</p>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Phone number</span>
            <input className="ms-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
            {errors.phone ? <p className="mt-1 text-xs text-theme-danger">{errors.phone}</p> : null}
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Subject specialisation</span>
            <SubjectSpecializationSelect value={specialization} onChange={setSpecialization} />
          </label>

          {bannerError ? (
            <div className="rounded-lg border border-theme bg-theme-danger-bg px-3 py-2 text-sm text-theme-danger">
              {bannerError}
            </div>
          ) : null}

          <button type="submit" className="ms-btn-primary w-full" disabled={loading}>
            {loading ? "Saving…" : "Save changes"}
          </button>
        </form>
      ) : null}
    </Modal>
  );
}
