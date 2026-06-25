"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, CheckCircle2, Copy } from "lucide-react";
import { Modal } from "@makyschool/ui/components/ui/Modal";
import { apiClient } from "@/lib/api/client";
import type { TeacherDetail } from "@/lib/teachers/types";
import { validateTeacherForm } from "@/lib/validation/teachers";
import { SubjectSpecializationSelect } from "./SubjectSpecializationSelect";

type CreateResponse = {
  teacher: TeacherDetail;
  temp_password: string;
};

export function AddTeacherPanel({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<CreateResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!open) {
      setFullName("");
      setEmail("");
      setPhone("");
      setSpecialization("");
      setErrors({});
      setBannerError(null);
      setSuccess(null);
      setDirty(false);
    }
  }, [open]);

  function requestClose() {
    if (dirty && !success && !window.confirm("Discard changes? Your unsaved teacher details will be lost.")) {
      return;
    }
    onClose();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const clientErrors = validateTeacherForm({ full_name: fullName, email, phone });
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;

    setLoading(true);
    setBannerError(null);

    try {
      const response = await apiClient<CreateResponse>("/schools/teachers", {
        method: "POST",
        body: {
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          subject_specialization: specialization.trim() || undefined,
          assignments: [],
        },
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
      size="md"
      title={success ? "Teacher account created" : "Add teacher"}
      description={
        success
          ? `${success.teacher.full_name} can now log in with their temporary password.`
          : "Create a teacher account. Assign teaching load on the next screen."
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
                setEmail("");
                setPhone("");
                setSpecialization("");
                setDirty(false);
              }}
            >
              Add another teacher
            </button>
            <Link
              href={`/dashboard/teaching-load?mode=by-teacher&teacherId=${success.teacher.id}`}
              className="ms-btn-primary flex-1 text-center"
              onClick={onClose}
            >
              Assign teaching load
            </Link>
          </div>
        ) : undefined
      }
    >
      {success ? (
        <div className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-theme-success" />
          <div className="rounded-lg border border-theme bg-theme-surface-raised px-4 py-3">
            <div className="flex items-center justify-center gap-2">
              <code className="font-mono text-sm text-theme-primary">{success.temp_password}</code>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(success.temp_password);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                }}
                className="ms-btn-secondary inline-flex items-center gap-1 px-2 py-1 text-xs"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
          <div className="badge-warning flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs">
            <AlertTriangle className="h-4 w-4" />
            Share this password securely. It will not be shown again.
          </div>
        </div>
      ) : (
        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5">
          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Full name *</span>
            <input
              className="ms-input"
              value={fullName}
              placeholder="e.g. John Ssali"
              onChange={(e) => {
                setFullName(e.target.value);
                setDirty(true);
                setErrors((prev) => ({ ...prev, full_name: "" }));
              }}
            />
            {errors.full_name ? <p className="mt-1 text-xs text-theme-danger">{errors.full_name}</p> : null}
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Email address *</span>
            <input
              type="email"
              className="ms-input"
              value={email}
              placeholder="e.g. john@school.ug"
              onChange={(e) => {
                setEmail(e.target.value);
                setDirty(true);
                setErrors((prev) => ({ ...prev, email: "" }));
              }}
            />
            {errors.email ? <p className="mt-1 text-xs text-theme-danger">{errors.email}</p> : null}
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Phone number</span>
            <input
              className="ms-input"
              value={phone}
              placeholder="e.g. +256 701 234 567"
              onChange={(e) => {
                setPhone(e.target.value);
                setDirty(true);
                setErrors((prev) => ({ ...prev, phone: "" }));
              }}
            />
            {errors.phone ? <p className="mt-1 text-xs text-theme-danger">{errors.phone}</p> : null}
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Subject specialisation</span>
            <SubjectSpecializationSelect
              value={specialization}
              onChange={(next) => {
                setSpecialization(next);
                setDirty(true);
              }}
            />
          </label>

          {bannerError ? (
            <div className="rounded-lg border border-theme bg-theme-danger-bg px-3 py-2 text-sm text-theme-danger">
              {bannerError}
            </div>
          ) : null}

          <button type="submit" className="ms-btn-primary w-full" disabled={loading}>
            {loading ? "Creating…" : "Create teacher account"}
          </button>
        </form>
      )}
    </Modal>
  );
}
