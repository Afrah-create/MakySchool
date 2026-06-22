"use client";

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import type { TeacherListItem } from "@/lib/teachers/types";

export function ResetPasswordDialog({
  teacher,
  onClose,
}: {
  teacher: TeacherListItem | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!teacher) return null;

  async function handleReset() {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient<{ temp_password: string }>(
        `/schools/teachers/${teacher!.id}/reset-password`,
        { method: "POST" },
      );
      setTempPassword(response.data.temp_password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-theme-overlay" onClick={onClose} aria-label="Close" />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-theme bg-theme-surface p-6 shadow-theme-panel">
        {tempPassword ? (
          <>
            <h2 className="text-lg font-semibold text-theme-primary">New temporary password</h2>
            <div className="mt-4 rounded-lg border border-theme bg-theme-surface-raised px-4 py-3">
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-sm">{tempPassword}</code>
                <button
                  type="button"
                  className="ms-btn-secondary px-2 py-1 text-xs"
                  onClick={async () => {
                    await navigator.clipboard.writeText(tempPassword);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            <p className="mt-3 text-xs text-theme-muted">
              Share this securely. Once you close this dialog, the password cannot be retrieved.
            </p>
            <button type="button" className="ms-btn-primary mt-6 w-full" onClick={onClose}>
              Done
            </button>
          </>
        ) : (
          <>
            <KeyRound className="mx-auto h-8 w-8 text-theme-accent" />
            <h2 className="mt-4 text-center text-lg font-semibold text-theme-primary">
              Reset password for {teacher.full_name}?
            </h2>
            <p className="mt-2 text-center text-sm text-theme-muted">
              A new temporary password will be generated. {teacher.full_name} will be prompted to set a new password on next login.
            </p>
            {error ? <p className="mt-3 text-center text-sm text-theme-danger">{error}</p> : null}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="ms-btn-secondary" disabled={loading} onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="ms-btn-primary" disabled={loading} onClick={() => void handleReset()}>
                {loading ? "Resetting…" : "Reset password"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
