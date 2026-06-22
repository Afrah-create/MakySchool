"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { apiClient } from "@/lib/api/client";
import { useApiSWR } from "@/hooks/useApiSWR";
import type { TeacherDetail } from "@/lib/teachers/types";
import { validateTeacherForm } from "@/lib/validation/teachers";

export function TeacherProfileContent() {
  const { data, error, isLoading, mutate } = useApiSWR<TeacherDetail>("/schools/teachers/me");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setFullName(data.full_name);
    setPhone(data.phone ?? "");
  }, [data]);

  const changed = data ? fullName !== data.full_name || phone !== (data.phone ?? "") : false;

  async function handleSave() {
    if (!data) return;
    const clientErrors = validateTeacherForm({ full_name: fullName, phone });
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;

    setSaving(true);
    setBanner(null);
    try {
      await apiClient(`/schools/teachers/${data.id}/profile`, {
        method: "PATCH",
        body: { full_name: fullName.trim(), phone: phone.trim() || null },
      });
      setBanner({ type: "success", message: "Profile updated." });
      await mutate();
    } catch (err) {
      setBanner({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to update profile.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardPage eyebrow="Teacher portal" title="My Profile" maxWidth="lg">
      <QueryState
        error={error}
        isLoading={isLoading}
        data={data}
        onRetry={() => void mutate()}
        loading={<Skeleton className="h-64 w-full" />}
        isEmpty={() => false}
      >
        {(teacher) => (
          <div className="space-y-6">
            <div className="rounded-xl border border-theme bg-theme-surface p-6">
              <h2 className="text-sm font-semibold text-theme-primary">Personal details</h2>
              {banner?.type === "success" ? (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-theme-success-bg px-3 py-2 text-sm text-theme-success">
                  <CheckCircle2 className="h-4 w-4" />
                  {banner.message}
                </div>
              ) : null}
              {banner?.type === "error" ? (
                <div className="mt-4 rounded-lg bg-theme-danger-bg px-3 py-2 text-sm text-theme-danger">
                  {banner.message}
                </div>
              ) : null}
              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="mb-1 block text-xs text-theme-muted">Full name</span>
                  <input className="ms-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                  {errors.full_name ? <p className="mt-1 text-xs text-theme-danger">{errors.full_name}</p> : null}
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-theme-muted">Phone number</span>
                  <input className="ms-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  {errors.phone ? <p className="mt-1 text-xs text-theme-danger">{errors.phone}</p> : null}
                </label>
                <div>
                  <p className="text-xs text-theme-muted">Email</p>
                  <p className="text-sm text-theme-primary">{teacher.email}</p>
                </div>
                <div>
                  <p className="text-xs text-theme-muted">Subject specialisation</p>
                  <p className="text-sm text-theme-primary">{teacher.subject_specialization || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-theme-muted">Role</p>
                  <p className="text-sm text-theme-primary">Teacher</p>
                </div>
              </div>
              <button
                type="button"
                className="ms-btn-primary mt-6"
                disabled={!changed || saving}
                onClick={() => void handleSave()}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>

            <div className="rounded-xl border border-theme bg-theme-surface p-6">
              <h2 className="text-sm font-semibold text-theme-primary">Account details</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-theme-muted">Account status</dt>
                  <dd>
                    <span className="badge-success inline-flex rounded-full px-2.5 py-0.5 text-xs">
                      {teacher.is_active ? "Active" : "Inactive"}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-theme-muted">Date joined</dt>
                  <dd>{new Date(teacher.created_at).toLocaleDateString()}</dd>
                </div>
                <div>
                  <dt className="text-theme-muted">Last login</dt>
                  <dd>{teacher.last_login ? new Date(teacher.last_login).toLocaleString() : "Never"}</dd>
                </div>
              </dl>
            </div>

            <p className="text-sm text-theme-muted">
              To change your email, role, or class assignments, contact your school administrator.
            </p>
          </div>
        )}
      </QueryState>
    </DashboardPage>
  );
}
