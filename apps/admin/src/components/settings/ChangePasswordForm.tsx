"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { StatusBanner } from "@makyschool/ui/components/ui/StatusBanner";
import { apiClient } from "@/lib/api/client";

const labelClass = "mb-2 block text-xs font-medium text-theme-muted";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validate() {
    if (newPassword.length < 8) {
      return "New password must be at least 8 characters";
    }
    if (!/\d/.test(newPassword)) {
      return "New password must contain at least one number";
    }
    if (newPassword !== confirmPassword) {
      return "Passwords do not match";
    }
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      setSuccess(null);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await apiClient("/superadmin/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword },
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Your password has been updated.");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Failed to update password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ms-panel p-6">
      <h2 className="text-base font-semibold text-theme-primary">Change password</h2>
      <p className="mt-1 text-sm text-theme-muted">
        Update your platform admin password. Use at least 8 characters with one number.
      </p>

      <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-4">
        {error ? <StatusBanner tone="error" message={error} onDismiss={() => setError(null)} /> : null}
        {success ? <StatusBanner tone="success" message={success} /> : null}

        <label className="block">
          <span className={labelClass}>Current password</span>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-faint" />
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              className="ms-input pl-10"
              required
            />
          </div>
        </label>

        <label className="block">
          <span className={labelClass}>New password</span>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-faint" />
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              className="ms-input pl-10"
              required
            />
          </div>
        </label>

        <label className="block">
          <span className={labelClass}>Confirm new password</span>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-faint" />
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              className="ms-input pl-10"
              required
            />
          </div>
        </label>

        <LoadingButton type="submit" loading={loading} loadingLabel="Saving…">
          Update password
        </LoadingButton>
      </form>
    </div>
  );
}
