"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "@makyschool/ui/components/ui/Modal";
import { apiClient } from "@/lib/api/client";
import type { StudentDetail } from "@/lib/students/types";
import { validateStudentForm } from "@/lib/validation/students";
import { useToast } from "@/providers/ToastProvider";

export function EditStudentPanel({
  student,
  onClose,
  onSaved,
}: {
  student: StudentDetail | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianRelationship, setGuardianRelationship] = useState("parent");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);

  const classLabel = useMemo(
    () => (student?.class_name ? student.class_name : "—"),
    [student?.class_name],
  );

  useEffect(() => {
    if (!student) return;
    setFullName(student.full_name);
    setDateOfBirth(student.date_of_birth?.slice(0, 10) ?? "");
    setGender(student.gender ?? "");
    setGuardianName(student.guardian?.full_name ?? "");
    setGuardianRelationship(student.guardian?.relationship ?? "parent");
    setGuardianPhone(student.guardian?.phone ?? "");
    setGuardianEmail(student.guardian?.email ?? "");
    setErrors({});
    setBannerError(null);
    setDirty(false);
  }, [student]);

  if (!student) return null;

  function requestClose() {
    if (dirty && !window.confirm("Discard changes? Your unsaved edits will be lost.")) {
      return;
    }
    onClose();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const clientErrors = validateStudentForm({
      full_name: fullName,
      date_of_birth: dateOfBirth,
      class_id: student!.current_class_id ?? student!.class_id ?? "set",
      guardian_name: guardianName,
      guardian_phone: guardianPhone,
    });
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;

    setLoading(true);
    setBannerError(null);

    try {
      await apiClient(`/schools/students/${student!.id}`, {
        method: "PATCH",
        body: {
          full_name: fullName.trim(),
          date_of_birth: dateOfBirth || null,
          gender: gender || null,
          guardian_name: guardianName.trim(),
          guardian_relationship: guardianRelationship,
          guardian_phone: guardianPhone.trim() || null,
          guardian_email: guardianEmail.trim() || null,
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
      open={Boolean(student)}
      onClose={requestClose}
      size="lg"
      title="Edit student"
      description={`Update details for ${student.full_name}.`}
    >
      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-6">
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-theme-muted">Student details</p>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-theme-muted">Learner ID</p>
              <p className="font-mono text-sm text-theme-primary">{student.learner_id}</p>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs text-theme-muted">Full name *</span>
              <input
                className="ms-input"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  setDirty(true);
                }}
              />
              {errors.full_name ? (
                <p className="mt-1 text-xs text-theme-danger">{errors.full_name}</p>
              ) : null}
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-theme-muted">Date of birth</span>
              <input
                type="date"
                className="ms-input"
                value={dateOfBirth}
                onChange={(e) => {
                  setDateOfBirth(e.target.value);
                  setDirty(true);
                }}
              />
            </label>

            <fieldset>
              <legend className="mb-2 text-xs text-theme-muted">Gender</legend>
              <div className="flex flex-wrap gap-2">
                {(["male", "female", "other"] as const).map((value) => (
                  <label
                    key={value}
                    className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm capitalize ${
                      gender === value
                        ? "border-theme-accent bg-theme-accent-muted text-theme-accent"
                        : "border-theme text-theme-muted"
                    }`}
                  >
                    <input
                      type="radio"
                      name="edit-gender"
                      value={value}
                      checked={gender === value}
                      onChange={() => {
                        setGender(value);
                        setDirty(true);
                      }}
                      className="sr-only"
                    />
                    {value}
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <p className="text-xs text-theme-muted">Class / Stream</p>
              <p className="text-sm font-medium text-theme-primary">{classLabel}</p>
              <p className="mt-1 text-xs text-theme-muted">
                Use &quot;Transfer class&quot; to move this student to a different class.
              </p>
            </div>
          </div>
        </div>

        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-theme-muted">Parent / Guardian</p>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs text-theme-muted">Guardian name *</span>
              <input
                className="ms-input"
                value={guardianName}
                onChange={(e) => {
                  setGuardianName(e.target.value);
                  setDirty(true);
                }}
              />
              {errors.guardian_name ? (
                <p className="mt-1 text-xs text-theme-danger">{errors.guardian_name}</p>
              ) : null}
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-theme-muted">Relationship</span>
              <select
                className="ms-input"
                value={guardianRelationship}
                onChange={(e) => {
                  setGuardianRelationship(e.target.value);
                  setDirty(true);
                }}
              >
                <option value="parent">Parent</option>
                <option value="guardian">Guardian</option>
                <option value="sibling">Sibling</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-theme-muted">Phone number</span>
              <input
                className="ms-input"
                value={guardianPhone}
                onChange={(e) => {
                  setGuardianPhone(e.target.value);
                  setDirty(true);
                }}
              />
              {errors.guardian_phone ? (
                <p className="mt-1 text-xs text-theme-danger">{errors.guardian_phone}</p>
              ) : null}
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-theme-muted">Email address</span>
              <input
                type="email"
                className="ms-input"
                value={guardianEmail}
                onChange={(e) => {
                  setGuardianEmail(e.target.value);
                  setDirty(true);
                }}
              />
            </label>
          </div>
        </div>

        {bannerError ? (
          <div className="flex items-start gap-2 rounded-lg bg-theme-danger-bg px-3 py-2 text-sm text-theme-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {bannerError}
          </div>
        ) : null}

        <button type="submit" className="ms-btn-primary w-full" disabled={loading}>
          {loading ? "Saving…" : "Save changes"}
        </button>
      </form>
    </Modal>
  );
}
