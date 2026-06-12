"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthAlert, AuthField, AuthSubmitButton } from "@/components/auth/AuthShell";
import { apiClient } from "@/lib/api/client";
import { clearSchoolSlug, persistSchoolSlug } from "@/lib/auth/session";

type LoginResponse = {
  accountType: "platform" | "school";
  role: string;
  redirectTo: string;
  school?: { slug: string; name: string; status: string } | null;
};

export function LoginForm({
  initialSchoolSlug,
  lockedSchoolSlug,
}: {
  initialSchoolSlug?: string;
  lockedSchoolSlug?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [schoolSlug, setSchoolSlug] = useState(initialSchoolSlug ?? "");
  const [error, setError] = useState<string | null>(null);
  const [needsSchoolSlug, setNeedsSchoolSlug] = useState(false);
  const [loading, setLoading] = useState(false);

  const showSchoolSlugField = !lockedSchoolSlug || needsSchoolSlug;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient<LoginResponse>("/auth/login", {
        method: "POST",
        body: {
          email,
          password,
          schoolSlug: lockedSchoolSlug ?? (schoolSlug.trim() || undefined),
        },
        schoolSlug: lockedSchoolSlug,
      });

      if (response.data.accountType === "school" && response.data.school?.slug) {
        persistSchoolSlug(response.data.school.slug);
      } else {
        clearSchoolSlug();
      }

      router.push(response.data.redirectTo);
      router.refresh();
    } catch (submissionError) {
      const message = submissionError instanceof Error ? submissionError.message : "Login failed";
      if (message.includes("school slug")) {
        setNeedsSchoolSlug(true);
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-5">
      <AuthField
        id="email"
        label="Email address"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        placeholder="you@school.ug"
      />

      <AuthField
        id="password"
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        placeholder="Enter your password"
      />

      {showSchoolSlugField ? (
        <AuthField
          id="schoolSlug"
          label={needsSchoolSlug ? "School slug" : "School slug (optional)"}
          value={schoolSlug}
          onChange={setSchoolSlug}
          disabled={Boolean(lockedSchoolSlug)}
          placeholder="e.g. easton-high"
          hint={
            lockedSchoolSlug
              ? "Signing in to this school subdomain."
              : needsSchoolSlug
                ? "Required — your account is linked to multiple schools."
                : "Only if your email is linked to more than one school."
          }
        />
      ) : null}

      {error ? <AuthAlert message={error} /> : null}

      <div className="pt-1">
        <AuthSubmitButton loading={loading}>Sign in</AuthSubmitButton>
      </div>

      <p className="border-t border-theme/80 pt-5 text-center text-xs leading-relaxed text-theme-faint">
        Accounts are provisioned by a platform administrator.
        <br />
        There is no public registration.
      </p>
    </form>
  );
}
