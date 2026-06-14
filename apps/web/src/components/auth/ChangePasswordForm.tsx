"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lock } from "lucide-react";
import { AuthAlert, AuthInput, AuthSubmitButton } from "@/components/auth/AuthShell";
import { changePasswordAction } from "@/lib/auth/change-password-action";
import { persistSchoolSlug } from "@/lib/auth/session";

export function ChangePasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
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
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await changePasswordAction(currentPassword, newPassword);

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.schoolSlug) {
        persistSchoolSlug(result.schoolSlug);
      }

      router.push(result.redirect ?? "/dashboard");
      router.refresh();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Failed to change password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-5">
      <AuthInput
        id="currentPassword"
        label="Temporary password"
        type="password"
        value={currentPassword}
        onChange={setCurrentPassword}
        autoComplete="current-password"
        placeholder="Enter your temporary password"
        icon={Lock}
      />

      <AuthInput
        id="newPassword"
        label="New password"
        type="password"
        value={newPassword}
        onChange={setNewPassword}
        autoComplete="new-password"
        placeholder="At least 8 characters with a number"
        icon={Lock}
      />

      <AuthInput
        id="confirmPassword"
        label="Confirm new password"
        type="password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        autoComplete="new-password"
        placeholder="Re-enter your new password"
        icon={Lock}
      />

      {error ? <AuthAlert message={error} /> : null}

      <AuthSubmitButton loading={loading} loadingLabel="Saving…">
        Set password
      </AuthSubmitButton>
    </form>
  );
}
