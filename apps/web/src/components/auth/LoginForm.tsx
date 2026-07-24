"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, IdCard, Lock } from "lucide-react";
import {
  AuthAlert,
  AuthInput,
  AuthSecondaryButton,
  AuthStepIndicator,
  AuthSubmitButton,
} from "@/components/auth/AuthShell";
import type { UserRole } from "@makyschool/shared/types";
import { resolvePostLoginPath } from "@/lib/roles";
import { apiClient } from "@/lib/api/client";
import { broadcastActivity } from "@/lib/auth/session-broadcast";
import { clearSchoolSlug, persistSchoolSlug, readStoredSchoolSlug } from "@/lib/auth/session";

type LoginStep = "identifier" | "password" | "school";

type LoginResponse = {
  accountType: "school";
  role: string;
  redirectTo: string;
  school?: { slug: string; name: string; status: string } | null;
};

function looksLikeEmail(value: string) {
  return value.includes("@");
}

function isValidIdentifier(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (looksLikeEmail(trimmed)) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  }
  // Learner IDs are alphanumeric with optional separators (e.g. SCH2024000123)
  return /^[A-Za-z0-9][A-Za-z0-9\-_]{2,31}$/.test(trimmed);
}

export function LoginForm({
  initialSchoolSlug,
  lockedSchoolSlug,
}: {
  initialSchoolSlug?: string;
  lockedSchoolSlug?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<LoginStep>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [schoolSlug, setSchoolSlug] = useState(
    () => lockedSchoolSlug ?? initialSchoolSlug ?? readStoredSchoolSlug() ?? "",
  );
  const effectiveSchoolSlug = lockedSchoolSlug ?? schoolSlug;
  const [identifierError, setIdentifierError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsSchoolSlug, setNeedsSchoolSlug] = useState(false);
  const [loading, setLoading] = useState(false);

  const isLearnerLogin = identifier.trim().length > 0 && !looksLikeEmail(identifier);
  // Learners: ID → password (2 steps). School slug only if the API requires it (rare).
  const totalSteps = needsSchoolSlug || step === "school" ? 3 : 2;
  const currentStep = step === "identifier" ? 1 : step === "password" ? 2 : 3;

  function goToIdentifierStep() {
    setStep("identifier");
    setError(null);
    setIdentifierError(null);
  }

  function handleContinueIdentifier(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!isValidIdentifier(identifier)) {
      setIdentifierError(
        looksLikeEmail(identifier)
          ? "Enter a valid email address"
          : "Enter a valid learner ID (from your school)",
      );
      return;
    }

    setIdentifierError(null);
    setStep("password");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (step === "identifier") {
      handleContinueIdentifier(event);
      return;
    }

    if (step === "school") {
      if (!effectiveSchoolSlug.trim()) {
        setError("Enter your school slug");
        return;
      }
      setError(null);
      setStep("password");
      return;
    }

    if (step === "password" && !password) {
      setError("Enter your password");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient<LoginResponse>("/auth/login", {
        method: "POST",
        body: {
          email: identifier.trim(),
          password,
          // Staff multi-school / rare learner ID collisions only
          schoolSlug: lockedSchoolSlug ?? (effectiveSchoolSlug.trim() || undefined),
        },
        schoolSlug: lockedSchoolSlug,
      });

      if (response.data.school?.slug) {
        persistSchoolSlug(response.data.school.slug);
      } else {
        clearSchoolSlug();
      }

      broadcastActivity(Date.now());

      router.push(
        resolvePostLoginPath({
          role: response.data.role as UserRole,
          mustChangePassword: response.data.redirectTo === "/auth/change-password",
          setupCompleted: response.data.redirectTo !== "/dashboard/setup",
        }),
      );
      router.refresh();
    } catch (submissionError) {
      const err = submissionError as Error & { code?: string };
      const message = err.message ?? "Login failed";

      if (err.code === "SCHOOL_SLUG_REQUIRED" || message.toLowerCase().includes("school slug")) {
        setNeedsSchoolSlug(true);
        setStep("school");
        setError(
          isLearnerLogin
            ? "This learner ID matches more than one school. Enter your school slug to continue."
            : "Your email is linked to multiple schools. Enter your school slug to continue.",
        );
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-5">
      <AuthStepIndicator current={currentStep} total={totalSteps} />

      {step === "identifier" ? (
        <div key="identifier-step" className="auth-step-enter space-y-5">
          <AuthInput
            id="identifier"
            label="Email or learner ID"
            type="text"
            value={identifier}
            onChange={(value) => {
              setIdentifier(value);
              if (identifierError) setIdentifierError(null);
            }}
            autoComplete="username"
            placeholder="you@school.ug or SCH2024000123"
            icon={IdCard}
            error={identifierError}
            hint="Staff use email. Parents and learners use the learner ID only."
          />
          <AuthSubmitButton loading={false}>Continue</AuthSubmitButton>
        </div>
      ) : null}

      {step === "password" ? (
        <div key="password-step" className="auth-step-enter space-y-5">
          <div className="auth-context-chip px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">Signing in as</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="truncate text-sm font-medium text-theme-primary">{identifier}</p>
              <button
                type="button"
                onClick={goToIdentifierStep}
                className="shrink-0 text-xs font-medium text-theme-accent hover:underline"
              >
                Edit
              </button>
            </div>
          </div>

          <AuthInput
            id="password"
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            placeholder="Enter your password"
            icon={Lock}
          />

          {error ? <AuthAlert message={error} /> : null}

          <div className="flex items-center justify-between gap-2">
            {isLearnerLogin ? (
              <p className="text-xs text-theme-muted">
                Forgot password? Ask your school administrator to reset it.
              </p>
            ) : (
              <Link
                href="/auth/forgot-password"
                className="text-xs font-medium text-theme-accent hover:underline"
              >
                Forgot password?
              </Link>
            )}
          </div>

          <AuthSubmitButton loading={loading}>Sign in</AuthSubmitButton>
          <AuthSecondaryButton onClick={goToIdentifierStep}>Back</AuthSecondaryButton>
        </div>
      ) : null}

      {step === "school" ? (
        <div key="school-step" className="auth-step-enter space-y-5">
          <div className="auth-context-chip px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">Account</p>
            <p className="mt-1 truncate text-sm font-medium text-theme-primary">{identifier}</p>
          </div>

          <AuthInput
            id="schoolSlug"
            label="School slug"
            value={effectiveSchoolSlug}
            onChange={setSchoolSlug}
            disabled={Boolean(lockedSchoolSlug)}
            placeholder="e.g. easton-high"
            icon={Building2}
            hint={
              lockedSchoolSlug
                ? "Signing in to this school subdomain."
                : "Which school are you signing into?"
            }
          />

          {error ? <AuthAlert message={error} /> : null}

          <AuthSubmitButton loading={loading}>Continue</AuthSubmitButton>
          <AuthSecondaryButton onClick={() => setStep("password")}>Back</AuthSecondaryButton>
        </div>
      ) : null}

      <p className="border-t border-theme/80 pt-4 text-center text-xs leading-relaxed text-theme-faint">
        Access is managed by your school administrator.
        <br />
        There is no public registration.
      </p>
    </form>
  );
}
