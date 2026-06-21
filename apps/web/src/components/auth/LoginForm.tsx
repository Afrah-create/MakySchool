"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, Lock, Mail } from "lucide-react";
import {
  AuthAlert,
  AuthInput,
  AuthSecondaryButton,
  AuthStepIndicator,
  AuthSubmitButton,
} from "@/components/auth/AuthShell";
import { apiClient } from "@/lib/api/client";
import { clearSchoolSlug, persistSchoolSlug, readStoredSchoolSlug } from "@/lib/auth/session";

type LoginStep = "email" | "password" | "school";

type LoginResponse = {
  accountType: "school";
  role: string;
  redirectTo: string;
  school?: { slug: string; name: string; status: string } | null;
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function LoginForm({
  initialSchoolSlug,
  lockedSchoolSlug,
}: {
  initialSchoolSlug?: string;
  lockedSchoolSlug?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<LoginStep>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [schoolSlug, setSchoolSlug] = useState(
    () => lockedSchoolSlug ?? initialSchoolSlug ?? readStoredSchoolSlug() ?? "",
  );
  const effectiveSchoolSlug = lockedSchoolSlug ?? schoolSlug;
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsSchoolSlug, setNeedsSchoolSlug] = useState(false);
  const [loading, setLoading] = useState(false);

  const totalSteps = needsSchoolSlug || step === "school" ? 3 : 2;
  const currentStep = step === "email" ? 1 : step === "password" ? 2 : 3;

  function goToEmailStep() {
    setStep("email");
    setError(null);
    setEmailError(null);
  }

  function handleContinueEmail(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!isValidEmail(email)) {
      setEmailError("Enter a valid email address");
      return;
    }

    setEmailError(null);
    setStep("password");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (step === "email") {
      handleContinueEmail(event);
      return;
    }

    if (step === "password" && !password) {
      setError("Enter your password");
      return;
    }

    if (step === "school" && !effectiveSchoolSlug.trim()) {
      setError("Enter your school slug");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient<LoginResponse>("/auth/login", {
        method: "POST",
        body: {
          email: email.trim(),
          password,
          schoolSlug: lockedSchoolSlug ?? (effectiveSchoolSlug.trim() || undefined),
        },
        schoolSlug: lockedSchoolSlug,
      });

      if (response.data.school?.slug) {
        persistSchoolSlug(response.data.school.slug);
      } else {
        clearSchoolSlug();
      }

      router.push(response.data.redirectTo);
      router.refresh();
    } catch (submissionError) {
      const err = submissionError as Error & { code?: string; redirectUrl?: string };
      const message = err.message ?? "Login failed";

      if (err.code === "PLATFORM_ACCOUNT") {
        const platformUrl =
          err.redirectUrl ??
          process.env.NEXT_PUBLIC_PLATFORM_APP_URL ??
          "http://localhost:3001/login";
        setError(`${message} Sign in at ${platformUrl}`);
      } else if (err.code === "SCHOOL_SLUG_REQUIRED" || message.toLowerCase().includes("school slug")) {
        setNeedsSchoolSlug(true);
        setStep("school");
        setError("Your email is linked to multiple schools. Enter your school slug to continue.");
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

      {step === "email" ? (
        <div key="email-step" className="auth-step-enter space-y-5">
          <AuthInput
            id="email"
            label="Email address"
            type="email"
            value={email}
            onChange={(value) => {
              setEmail(value);
              if (emailError) setEmailError(null);
            }}
            autoComplete="email"
            placeholder="you@school.ug"
            icon={Mail}
            error={emailError}
          />
          <AuthSubmitButton loading={false}>Continue</AuthSubmitButton>
        </div>
      ) : null}

      {step === "password" ? (
        <div key="password-step" className="auth-step-enter space-y-5">
          <div className="auth-context-chip px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">Signing in as</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="truncate text-sm font-medium text-theme-primary">{email}</p>
              <button
                type="button"
                onClick={goToEmailStep}
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

          <AuthSubmitButton loading={loading}>Sign in</AuthSubmitButton>
          <AuthSecondaryButton onClick={goToEmailStep}>Back</AuthSecondaryButton>
        </div>
      ) : null}

      {step === "school" ? (
        <div key="school-step" className="auth-step-enter space-y-5">
          <div className="auth-context-chip px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">Account</p>
            <p className="mt-1 truncate text-sm font-medium text-theme-primary">{email}</p>
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

          <AuthSubmitButton loading={loading}>Continue to sign in</AuthSubmitButton>
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
