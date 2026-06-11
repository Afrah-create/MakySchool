"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SchoolRecord } from "@makyschool/shared/types";
import { ProfileStep } from "@/components/setup/steps/ProfileStep";
import { AcademicYearStep } from "@/components/setup/steps/AcademicYearStep";
import { GradingScaleStep } from "@/components/setup/steps/GradingScaleStep";
import { ReviewStep } from "@/components/setup/steps/ReviewStep";
import { apiClient } from "@/lib/api/client";

const storageKey = "makyschool.setupDraft";

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
      bands: [{ label: "A", minScore: 80, maxScore: 100, description: "Excellent" }],
    },
  };
}

function validateStep(state: WizardState, step: number) {
  if (step === 1) {
    if (!state.profile.name.trim()) return "School name is required";
    if (!state.profile.email.trim()) return "School email is required";
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
  }

  return null;
}

export function WizardShell({
  school,
  schoolSlug,
}: {
  school?: SchoolRecord | null;
  schoolSlug: string;
}) {
  const router = useRouter();
  const [state, setState] = useState(() => initialState(school));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...state,
        profile: { ...state.profile, logo: null, stamp: null },
      }),
    );
  }, [state]);

  const steps = useMemo(
    () => ["School Profile", "Academic Year", "Grading Scale", "Review & Finish"],
    [],
  );

  function goNext() {
    const validationError = validateStep(state, state.step);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setState({ ...state, step: state.step + 1 });
  }

  async function finishSetup() {
    const validationError = validateStep(state, 3);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const profileData = new FormData();
      profileData.set("name", state.profile.name);
      profileData.set("email", state.profile.email);
      profileData.set("phone", state.profile.phone);
      profileData.set("address", state.profile.address);
      profileData.set("school_type", state.profile.schoolType);
      if (state.profile.logo) profileData.set("logo", state.profile.logo);
      if (state.profile.stamp) profileData.set("stamp", state.profile.stamp);

      const profileResponse = await apiClient("/schools/setup/profile", {
        method: "POST",
        body: profileData,
        schoolSlug,
      });

      if (!profileResponse.data) {
        throw new Error("Failed to save school profile");
      }

      await apiClient("/schools/setup/academic-year", {
        method: "POST",
        body: state.academicYear,
        schoolSlug,
      });

      await apiClient("/schools/setup/grading-scale", {
        method: "POST",
        body: state.gradingScale.bands,
        schoolSlug,
      });

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

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">Step {state.step} of 4</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{steps[state.step - 1]}</h1>
        </div>
        <div className="flex gap-2">
          {steps.map((step, index) => (
            <span
              key={step}
              className={`h-2 w-8 rounded-full ${index + 1 <= state.step ? "bg-indigo-700" : "bg-slate-200"}`}
            />
          ))}
        </div>
      </div>

      <div className="mt-6">
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
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setState({ ...state, step: Math.max(1, state.step - 1) })}
          disabled={state.step === 1}
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 disabled:opacity-40"
        >
          Back
        </button>
        {state.step < 4 ? (
          <button
            type="button"
            onClick={goNext}
            className="rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-medium text-white"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void finishSetup()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-70"
          >
            {loading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
            ) : null}
            Confirm & Launch Dashboard
          </button>
        )}
      </div>
    </div>
  );
}
