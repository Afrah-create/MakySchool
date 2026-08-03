"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Mail, Phone, Shield, UserRound } from "lucide-react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { apiClient } from "@/lib/api/client";
import { useApiSWR } from "@/hooks/useApiSWR";
import type { TeacherDetail } from "@/lib/teachers/types";
import {
  teacherInitials,
  validateTeacherProfileFields,
} from "@/lib/validation/teachers";

export function TeacherProfileContent() {
  const { data, error, isLoading, mutate } = useApiSWR<TeacherDetail>(
    "/schools/teachers/me",
  );
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setFullName(data.full_name);
    setPhone(data.phone ?? "");
  }, [data]);

  const changed = data
    ? fullName !== data.full_name || phone !== (data.phone ?? "")
    : false;

  async function handleSave(event?: React.FormEvent) {
    event?.preventDefault();
    if (!data) return;
    const clientErrors = validateTeacherProfileFields({
      full_name: fullName,
      phone,
    });
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;

    setSaving(true);
    setBanner(null);
    try {
      await apiClient(`/schools/teachers/${data.id}/profile`, {
        method: "PATCH",
        body: {
          full_name: fullName.trim(),
          phone: phone.trim() || null,
        },
      });
      setBanner({ type: "success", message: "Profile updated." });
      await mutate();
    } catch (err) {
      const requestError = err as Error & { fields?: Record<string, string> };
      if (requestError.fields) setErrors(requestError.fields);
      setBanner({
        type: "error",
        message:
          requestError instanceof Error
            ? requestError.message
            : "Failed to update profile.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardPage
      eyebrow="Teacher portal"
      title="My profile"
      description="Update how your name and phone appear across the school."
      maxWidth="2xl"
      embedded
    >
      <QueryState
        error={error}
        isLoading={isLoading}
        data={data}
        onRetry={() => void mutate()}
        loading={<Skeleton className="h-72 w-full rounded-2xl" />}
        isEmpty={() => false}
      >
        {(teacher) => (
          <form
            onSubmit={(e) => void handleSave(e)}
            className="overflow-hidden rounded-2xl border border-theme bg-theme-surface shadow-theme-card"
          >
            <div className="border-b border-theme bg-gradient-to-br from-theme-raised/80 to-theme-surface px-5 py-6 sm:px-6">
              <div className="flex flex-wrap items-center gap-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-theme-accent-muted text-lg font-semibold text-theme-accent">
                  {teacherInitials(teacher.full_name)}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-theme-primary">
                    {teacher.full_name}
                  </h2>
                  <p className="mt-0.5 truncate text-sm text-theme-muted">
                    {teacher.email}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-theme-raised px-2.5 py-0.5 text-xs font-medium text-theme-secondary">
                      <UserRound className="h-3 w-3" />
                      Teacher
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        teacher.is_active ? "badge-success" : "badge-danger"
                      }`}
                    >
                      {teacher.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-5 p-5 sm:p-6">
              {banner?.type === "success" ? (
                <div className="flex items-center gap-2 rounded-xl bg-theme-success-bg px-3.5 py-2.5 text-sm text-theme-success">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {banner.message}
                </div>
              ) : null}
              {banner?.type === "error" ? (
                <div className="rounded-xl bg-theme-danger-bg px-3.5 py-2.5 text-sm text-theme-danger">
                  {banner.message}
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-theme-muted">
                    <UserRound className="h-3.5 w-3.5" />
                    Full name
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
                    <p className="mt-1.5 text-xs text-theme-danger">
                      {errors.full_name}
                    </p>
                  ) : null}
                </label>

                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-theme-muted">
                    <Phone className="h-3.5 w-3.5" />
                    Phone
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
                    <p className="mt-1.5 text-xs text-theme-danger">
                      {errors.phone}
                    </p>
                  ) : null}
                </label>

                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-theme-muted">
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </p>
                  <p className="rounded-lg border border-theme bg-theme-raised/40 px-3 py-2.5 text-sm text-theme-primary">
                    {teacher.email}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 rounded-xl border border-theme bg-theme-raised/30 p-4 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-theme-muted">
                    Specialisation
                  </p>
                  <p className="mt-1 text-sm text-theme-primary">
                    {teacher.subject_specialization || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-theme-muted">
                    Last login
                  </p>
                  <p className="mt-1 text-sm text-theme-primary">
                    {teacher.last_login
                      ? new Date(teacher.last_login).toLocaleString()
                      : "Never"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-theme-muted">
                    Joined
                  </p>
                  <p className="mt-1 text-sm text-theme-primary">
                    {new Date(teacher.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <Shield className="mt-0.5 h-3.5 w-3.5 text-theme-muted" />
                  <p className="text-xs leading-relaxed text-theme-muted">
                    Email, role, and class assignments are managed by your school
                    administrator.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-theme pt-4">
                {!changed ? (
                  <span className="mr-auto text-xs text-theme-muted">
                    No unsaved changes
                  </span>
                ) : (
                  <span className="mr-auto text-xs font-medium text-theme-accent">
                    Unsaved changes
                  </span>
                )}
                <LoadingButton
                  type="submit"
                  loading={saving}
                  disabled={!changed}
                >
                  Save changes
                </LoadingButton>
              </div>
            </div>
          </form>
        )}
      </QueryState>
    </DashboardPage>
  );
}
