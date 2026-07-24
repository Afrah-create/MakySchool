"use client";

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { apiClient } from "@/lib/api/client";

export function ResetStudentPortalPasswordDialog({
  student,
  onClose,
  onDone,
}: {
  student: { id: string; full_name: string; learner_id: string } | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!student) return null;

  async function handleReset() {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient<{ temp_password: string }>(
        `/schools/students/${student!.id}/reset-password`,
        { method: "POST" },
      );
      setTempPassword(response.data.temp_password);
      onDone?.();
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
            <h2 className="text-lg font-semibold text-theme-primary">Portal credentials</h2>
            <p className="mt-1 text-sm text-theme-muted">
              Learner ID <span className="font-mono text-theme-primary">{student.learner_id}</span>
            </p>
            <div className="mt-4 rounded-lg border border-theme bg-theme-surface-raised px-4 py-3">
              <p className="mb-1 text-xs text-theme-muted">Temporary password</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-sm">{tempPassword}</code>
                <button
                  type="button"
                  className="ms-btn-secondary px-2 py-1 text-xs"
                  onClick={async () => {
                    await navigator.clipboard.writeText(
                      `Learner ID: ${student.learner_id}\nPassword: ${tempPassword}`,
                    );
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            <p className="mt-3 text-xs text-theme-muted">
              Share securely with the parent or learner. They must change this password on next login.
            </p>
            <button type="button" className="ms-btn-primary mt-6 w-full" onClick={onClose}>
              Done
            </button>
          </>
        ) : (
          <>
            <KeyRound className="mx-auto h-8 w-8 text-theme-accent" />
            <h2 className="mt-4 text-center text-lg font-semibold text-theme-primary">
              Reset portal password?
            </h2>
            <p className="mt-2 text-center text-sm text-theme-muted">
              Creates or resets the shared learner portal login for{" "}
              <span className="font-medium text-theme-primary">{student.full_name}</span>. Parents and
              the learner use the learner ID with this temporary password.
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
