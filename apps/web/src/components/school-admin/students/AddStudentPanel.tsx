"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { PRIMARY_CLASS_LEVELS, SECONDARY_CLASS_LEVELS, formatClassLabel } from "@makyschool/shared/constants";
import { Modal } from "@makyschool/ui/components/ui/Modal";
import { apiClient } from "@/lib/api/client";
import { useApiSWR } from "@/hooks/useApiSWR";
import { useSchool } from "@/providers/SchoolProvider";
import type { ClassOption, CreateStudentResponse } from "@/lib/students/types";
import { validateStudentForm } from "@/lib/validation/students";

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

function groupClasses(classes: ClassOption[]) {
  const primary = classes.filter((item) =>
    (PRIMARY_CLASS_LEVELS as readonly string[]).includes(item.level),
  );
  const secondary = classes.filter((item) =>
    (SECONDARY_CLASS_LEVELS as readonly string[]).includes(item.level),
  );
  return [
    { label: "Primary", items: primary },
    { label: "Secondary", items: secondary },
  ].filter((group) => group.items.length > 0);
}

export function AddStudentPanel({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const { schoolSlug } = useSchool();
  const { data: classes = [] } = useApiSWR<ClassOption[]>("/schools/classes");

  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [classId, setClassId] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianRelationship, setGuardianRelationship] = useState("parent");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<CreateStudentResponse | null>(null);
  const [dirty, setDirty] = useState(false);

  const classGroups = useMemo(() => groupClasses(classes), [classes]);

  useEffect(() => {
    if (!open) {
      setFullName("");
      setDateOfBirth("");
      setGender("");
      setClassId("");
      setGuardianName("");
      setGuardianRelationship("parent");
      setGuardianPhone("");
      setGuardianEmail("");
      setPhoto(null);
      setPhotoPreview(null);
      setErrors({});
      setBannerError(null);
      setSuccess(null);
      setDirty(false);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  function requestClose() {
    if (dirty && !success && !window.confirm("Discard changes? Your unsaved student details will be lost.")) {
      return;
    }
    onClose();
  }

  function handlePhotoSelect(file: File | null) {
    if (!file) {
      setPhoto(null);
      setPhotoPreview(null);
      return;
    }

    if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
      setErrors((prev) => ({ ...prev, photo: "Photo must be a JPEG, PNG, or WebP image." }));
      return;
    }

    if (file.size > MAX_PHOTO_BYTES) {
      setErrors((prev) => ({ ...prev, photo: "Photo must be under 2 MB." }));
      return;
    }

    setErrors((prev) => {
      const next = { ...prev };
      delete next.photo;
      return next;
    });
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setDirty(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const clientErrors = validateStudentForm({
      full_name: fullName,
      date_of_birth: dateOfBirth,
      class_id: classId,
      guardian_name: guardianName,
      guardian_phone: guardianPhone,
    });
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;

    setLoading(true);
    setBannerError(null);

    try {
      const formData = new FormData();
      formData.append("full_name", fullName.trim());
      if (dateOfBirth) formData.append("date_of_birth", dateOfBirth);
      if (gender) formData.append("gender", gender);
      formData.append("class_id", classId);
      formData.append("guardian_name", guardianName.trim());
      formData.append("guardian_relationship", guardianRelationship);
      if (guardianPhone.trim()) formData.append("guardian_phone", guardianPhone.trim());
      if (guardianEmail.trim()) formData.append("guardian_email", guardianEmail.trim());
      if (photo) formData.append("photo", photo);

      const response = await apiClient<CreateStudentResponse>("/schools/students", {
        method: "POST",
        body: formData,
        schoolSlug,
      });

      setSuccess(response.data);
      onSaved();
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
      onClose={requestClose}
      size="lg"
      title={success ? "Student registered" : "Add student"}
      description={
        success
          ? `${success.student.full_name} has been registered successfully.`
          : "Register a new student and assign them to a class."
      }
      footer={
        success ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="ms-btn-secondary flex-1"
              onClick={() => {
                setSuccess(null);
                setFullName("");
                setDateOfBirth("");
                setGender("");
                setClassId("");
                setGuardianName("");
                setGuardianPhone("");
                setGuardianEmail("");
                setPhoto(null);
                setPhotoPreview(null);
                setDirty(false);
              }}
            >
              Add another student
            </button>
            <button
              type="button"
              className="ms-btn-primary flex-1"
              onClick={() => {
                onClose();
                router.push(`/dashboard/students/${success.student.id}`);
              }}
            >
              View profile
            </button>
          </div>
        ) : undefined
      }
    >
      {success ? (
        <div className="flex flex-col items-center py-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-theme-success" />
          <p className="mt-4 font-mono text-2xl font-semibold text-theme-primary">
            {success.student.learner_id}
          </p>
          <p className="mt-2 text-sm text-theme-primary">{success.student.full_name}</p>
          <p className="text-sm text-theme-muted">{success.student.class_name ?? "—"}</p>
        </div>
      ) : (
        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-6">
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-theme-muted">Student details</p>
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-xs text-theme-muted">Full name *</span>
                <input
                  className="ms-input"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    setDirty(true);
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.full_name;
                      return next;
                    });
                  }}
                  placeholder="e.g. John Doe"
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
                {errors.date_of_birth ? (
                  <p className="mt-1 text-xs text-theme-danger">{errors.date_of_birth}</p>
                ) : null}
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
                        name="gender"
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

              <label className="block">
                <span className="mb-1 block text-xs text-theme-muted">Class / Stream *</span>
                <select
                  className="ms-input"
                  value={classId}
                  onChange={(e) => {
                    setClassId(e.target.value);
                    setDirty(true);
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.class_id;
                      return next;
                    });
                  }}
                >
                  <option value="">Select a class</option>
                  {classGroups.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {formatClassLabel(item.level, item.stream)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {errors.class_id ? (
                  <p className="mt-1 text-xs text-theme-danger">{errors.class_id}</p>
                ) : null}
              </label>

              <div>
                <span className="mb-1 block text-xs text-theme-muted">Photo</span>
                <div className="flex items-center gap-3">
                  {photoPreview ? (
                    <img src={photoPreview} alt="" className="h-16 w-16 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-theme-raised text-xs text-theme-muted">
                      No photo
                    </div>
                  )}
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => handlePhotoSelect(e.target.files?.[0] ?? null)}
                    />
                    {photo ? (
                      <p className="mt-1 text-xs text-theme-muted">
                        {(photo.size / 1024).toFixed(0)} KB
                        <button
                          type="button"
                          className="ml-2 text-theme-danger"
                          onClick={() => handlePhotoSelect(null)}
                        >
                          <X className="inline h-3 w-3" />
                        </button>
                      </p>
                    ) : null}
                  </div>
                </div>
                {errors.photo ? <p className="mt-1 text-xs text-theme-danger">{errors.photo}</p> : null}
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
                  placeholder="e.g. +256 701 234 567"
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

          <div className="flex items-start gap-2 rounded-lg border border-theme bg-theme-raised px-3 py-2 text-sm text-theme-muted">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-theme-accent" />
            <p>A unique learner ID will be automatically generated when you save (e.g. EST-2026-047).</p>
          </div>

          {bannerError ? (
            <div className="flex items-start gap-2 rounded-lg bg-theme-danger-bg px-3 py-2 text-sm text-theme-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {bannerError}
            </div>
          ) : null}

          <button type="submit" className="ms-btn-primary w-full" disabled={loading}>
            {loading ? "Registering…" : "Register student"}
          </button>
        </form>
      )}
    </Modal>
  );
}
