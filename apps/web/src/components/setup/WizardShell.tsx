"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SchoolRecord } from "@makyschool/shared/types";
import { ProfileStep } from "@/components/setup/steps/ProfileStep";
import { AcademicYearStep } from "@/components/setup/steps/AcademicYearStep";
import { GradingScaleStep } from "@/components/setup/steps/GradingScaleStep";
import { ReviewStep } from "@/components/setup/steps/ReviewStep";
import { apiClient } from "@/lib/api/client";
import { persistSchoolSlug } from "@/lib/auth/session";

type WizardState = {
  step: number;
  profile: {
    name: string;
    logo: File | null;
    stamp: File | null;
    email: string;
    phone: string;
    address: string;
    schoolType: string;
  };
  academicYear: {
    year: number;
    terms: Array<{ name: string; startDate: string; endDate: string }>;
  };
  gradingScale: {
    bands: Array<{ label: string; minScore: number; maxScore: number; description: string }>;
  };
};

const STEP_LABELS = ["School Profile", "Academic Year", "Grading Scale", "Review & Confirm"];

function draftKey(schoolId: string) {
  return `setup_draft_${schoolId}`;
}

function initialState(school?: SchoolRecord | null): WizardState {
  return {
    step: 1,
    profile: {
      name: school?.name ?? "",
      logo: null,
      stamp: null,
      email: school?.email ?? "",
      phone: school?.phone ?? "",
      address: school?.address ?? "",
      schoolType: school?.school_type ?? "primary",
    },
    academicYear: {
      year: new Date().getFullYear(),
      terms: [
        { name: "Term 1", startDate: "", endDate: "" },
        { name: "Term 2", startDate: "", endDate: "" },
        { name: "Term 3", startDate: "", endDate: "" },
      ],
    },
    gradingScale: {
      bands: [
        { label: "Distinction", minScore: 75, maxScore: 100, description: "" },
        { label: "Credit", minScore: 60, maxScore: 74, description: "" },
        { label: "Pass", minScore: 45, maxScore: 59, description: "" },
        { label: "Fail", minScore: 0, maxScore: 44, description: "" },
      ],
    },
  };
}

function validateStep(state: WizardState, step: number) {
  if (step === 1) {
    if (!state.profile.name.trim()) return "School name is required";
    if (!state.profile.email.trim()) return "Official email is required";
    if (!state.profile.schoolType) return "School type is required";
  }

  if (step === 2) {
    if (!state.academicYear.year) return "Academic year is required";
    for (const term of state.academicYear.terms) {
      if (!term.name.trim()) return "Each term must have a name";
    }
  }

  if (step === 3) {
    if (state.gradingScale.bands.length === 0) return "Add at least one grading band";
    for (const band of state.gradingScale.bands) {
      if (!band.label.trim()) return "Each grading band needs a label";
      if (band.minScore > band.maxScore) return "Min score cannot exceed max score";
    }

    const sorted = [...state.gradingScale.bands].sort((a, b) => a.minScore - b.minScore);
    for (let index = 0; index < sorted.length; index += 1) {
      const band = sorted[index];
      if (band.minScore < 0 || band.maxScore > 100) {
        return "All scores must be between 0 and 100";
      }
      if (index > 0 && band.minScore <= sorted[index - 1].maxScore) {
        return "Grading bands cannot overlap";
      }
    }

    const coverageStart = sorted[0]?.minScore ?? -1;
    const coverageEnd = sorted[sorted.length - 1]?.maxScore ?? -1;
    if (coverageStart !== 0 || coverageEnd !== 100) {
      return "Grading bands must cover the full 0–100 range";
    }
  }

  return null;
}

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center">
      {STEP_LABELS.map((_, index) => {
        const stepNumber = index + 1;
        const isCompleted = stepNumber < currentStep;
        const isCurrent = stepNumber === currentStep;

        return (
          <div key={stepNumber} className="flex items-center">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
                isCompleted
                  ? "bg-theme-accent text-on-accent"
                  : isCurrent
                    ? "border-2 border-theme-accent text-theme-accent"
                    : "border border-theme text-theme-muted"
              }`}
            >
              {stepNumber}
            </div>
            {stepNumber < STEP_LABELS.length ? (
              <div
                className={`mx-2 h-px w-8 sm:w-12 ${
                  stepNumber < currentStep ? "bg-theme-accent" : "bg-theme-icon"
                }`}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function WizardShell({
  school,
  schoolSlug,
  schoolId,
}: {
  school?: SchoolRecord | null;
  schoolSlug: string;
  schoolId: string;
}) {
  const router = useRouter();
  const [state, setState] = useState(() => initialState(school));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusChecked, setStatusChecked] = useState(false);

  const storageKey = useMemo(() => draftKey(schoolId), [schoolId]);

  useEffect(() => {
    persistSchoolSlug(schoolSlug);
  }, [schoolSlug]);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<WizardState>;
        setState((current) => ({
          ...current,
          ...parsed,
          profile: { ...current.profile, ...parsed.profile, logo: null, stamp: null },
        }));
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }
  }, [storageKey]);

  useEffect(() => {
    if (!statusChecked) {
      return;
    }
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...state,
        profile: { ...state.profile, logo: null, stamp: null },
      }),
    );
  }, [state, storageKey, statusChecked]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await apiClient<{
          completed: boolean;
          school: SchoolRecord | null;
        }>("/schools/setup/status", { schoolSlug });

        if (response.data.completed) {
          router.replace("/dashboard");
          return;
        }

        if (response.data.school) {
          setState((current) => ({
            ...current,
            profile: {
              ...current.profile,
              name: response.data.school?.name ?? current.profile.name,
              email: response.data.school?.email ?? current.profile.email,
              phone: response.data.school?.phone ?? current.profile.phone,
              address: response.data.school?.address ?? current.profile.address,
              schoolType: response.data.school?.school_type ?? current.profile.schoolType,
            },
          }));
        }
      } catch {
        // allow wizard to render; step saves will surface errors
      } finally {
        setStatusChecked(true);
      }
    })();
  }, [router, schoolSlug]);

  async function persistStep(step: number) {
    if (step === 1) {
      const profileData = new FormData();
      profileData.set("name", state.profile.name);
      profileData.set("email", state.profile.email);
      profileData.set("phone", state.profile.phone);
      profileData.set("address", state.profile.address);
      profileData.set("school_type", state.profile.schoolType);
      if (state.profile.logo) profileData.set("logo", state.profile.logo);
      if (state.profile.stamp) profileData.set("stamp", state.profile.stamp);

      await apiClient("/schools/setup/profile", {
        method: "PATCH",
        body: profileData,
        schoolSlug,
      });
      return;
    }

    if (step === 2) {
      await apiClient("/schools/setup/academic-year", {
        method: "POST",
        body: state.academicYear,
        schoolSlug,
      });
      return;
    }

    if (step === 3) {
      await apiClient("/schools/setup/grading-scale", {
        method: "POST",
        body: state.gradingScale.bands,
        schoolSlug,
      });
    }
  }

  async function goNext() {
    const validationError = validateStep(state, state.step);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await persistStep(state.step);
      setState({ ...state, step: state.step + 1 });
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Failed to save step");
    } finally {
      setLoading(false);
    }
  }

  async function finishSetup() {
    setLoading(true);
    setError(null);

    try {
      await apiClient("/schools/setup/complete", {
        method: "POST",
        schoolSlug,
      });

      window.localStorage.removeItem(storageKey);
      router.push("/dashboard");
      router.refresh();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Setup failed");
    } finally {
      setLoading(false);
    }
  }

  if (!statusChecked) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-theme border-t-theme-accent" />
        <p className="text-sm text-theme-muted">Preparing your setup wizard…</p>
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-2xl px-4 py-10 sm:py-12">
      <div
        aria-hidden
        className="wizard-glow pointer-events-none absolute -top-8 left-1/2 h-40 w-72 -translate-x-1/2 rounded-full blur-3xl"
      />

      <div className="relative mb-8 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">
          Step {state.step} of 4
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-theme-primary">
          {STEP_LABELS[state.step - 1]}
        </h1>
        <p className="mt-2 text-sm text-theme-muted">
          {state.step === 4
            ? "Review everything before launching your school workspace."
            : "Complete each section to activate your school on MakySchool."}
        </p>
        <div className="mt-8">
          <StepIndicator currentStep={state.step} />
        </div>
      </div>

      <div className="relative rounded-2xl border border-theme bg-theme-surface p-6 shadow-xl shadow-black/20 sm:p-8">
        {state.step === 1 ? (
          <ProfileStep
            value={state.profile}
            onChange={(profile) => setState({ ...state, profile })}
          />
        ) : null}
        {state.step === 2 ? (
          <AcademicYearStep
            value={state.academicYear}
            onChange={(academicYear) => setState({ ...state, academicYear })}
          />
        ) : null}
        {state.step === 3 ? (
          <GradingScaleStep
            value={state.gradingScale}
            onChange={(gradingScale) => setState({ ...state, gradingScale })}
          />
        ) : null}
        {state.step === 4 ? <ReviewStep data={state} /> : null}

        {error ? (
          <div className="mt-4 alert-error rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        ) : null}

        <div className="mt-8 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setState({ ...state, step: Math.max(1, state.step - 1) })}
            disabled={state.step === 1 || loading}
            className="ms-btn-ghost disabled:opacity-40"
          >
            Back
          </button>
          {state.step < 4 ? (
            <button
              type="button"
              onClick={() => void goNext()}
              disabled={loading}
              className="ms-btn-primary disabled:opacity-70"
            >
              {loading ? "Saving…" : "Next"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void finishSetup()}
              disabled={loading}
              className="ms-btn-primary disabled:opacity-70"
            >
              {loading ? "Launching…" : "Confirm & Launch Dashboard"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
