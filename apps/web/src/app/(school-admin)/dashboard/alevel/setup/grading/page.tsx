'use client';

import { useState } from 'react';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { PageHeader } from '@makyschool/ui/components/ui/PageHeader';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { EmptyState } from '@makyschool/ui/components/ui/EmptyState';
import { LoadingButton } from '@makyschool/ui/components/ui/LoadingButton';
import type { ALevelGradeBand } from '@makyschool/shared';
import {
  useALevelGradingScale,
  useSaveALevelGradingScale,
} from '@/hooks/useALevel';

const DEFAULT_BANDS: ALevelGradeBand[] = [
  { minScore: 80, grade: 'A', points: 6 },
  { minScore: 70, grade: 'B', points: 5 },
  { minScore: 60, grade: 'C', points: 4 },
  { minScore: 50, grade: 'D', points: 3 },
  { minScore: 40, grade: 'E', points: 2 },
  { minScore: 35, grade: 'O', points: 1 },
  { minScore: 0, grade: 'F', points: 0 },
];

export default function ALevelGradingPage() {
  const { data, isPending, isError, refetch } = useALevelGradingScale();
  const save = useSaveALevelGradingScale();

  const [bands, setBands] = useState<ALevelGradeBand[]>([]);
  const [threshold, setThreshold] = useState(35);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [syncedData, setSyncedData] = useState<typeof data>(undefined);

  // Load the fetched scale into editable state whenever fresh data arrives.
  if (data && data !== syncedData) {
    setSyncedData(data);
    setBands(data.bands);
    setThreshold(data.subsidiaryPassThreshold);
  }

  function updateBand(index: number, patch: Partial<ALevelGradeBand>) {
    setBands((prev) =>
      prev.map((b, i) => (i === index ? { ...b, ...patch } : b)),
    );
    setSaved(false);
  }

  function addBand() {
    setBands((prev) => [...prev, { minScore: 0, grade: '', points: 0 }]);
    setSaved(false);
  }

  function removeBand(index: number) {
    setBands((prev) => prev.filter((_, i) => i !== index));
    setSaved(false);
  }

  function resetDefaults() {
    setBands(DEFAULT_BANDS);
    setThreshold(35);
    setSaved(false);
  }

  async function submit() {
    setError(null);
    setSaved(false);
    const cleaned = bands
      .map((b) => ({ ...b, grade: b.grade.trim().toUpperCase() }))
      .filter((b) => b.grade);
    if (cleaned.length === 0) {
      setError('Add at least one grade band.');
      return;
    }
    const grades = cleaned.map((b) => b.grade);
    if (new Set(grades).size !== grades.length) {
      setError('Grade letters must be unique.');
      return;
    }
    try {
      await save.mutateAsync({
        bands: cleaned,
        subsidiaryPassThreshold: threshold,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save grading scale.');
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <PageHeader
        title="A-Level grading scale"
        description="Principal subjects map to A–F by score band. Subsidiary subjects are pass/fail."
        actions={
          <button type="button" onClick={resetDefaults} className="ms-btn-ghost">
            <RotateCcw className="h-4 w-4" />
            UNEB defaults
          </button>
        }
      />

      {isPending ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : isError ? (
        <EmptyState
          variant="error"
          title="Couldn’t load the grading scale"
          description="Check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : (
        <>
          {error ? (
            <div className="rounded-xl border border-theme bg-theme-danger-bg/50 px-4 py-3 text-sm text-theme-danger">
              {error}
            </div>
          ) : null}
          {saved ? (
            <div className="rounded-xl border border-theme bg-theme-success-bg/50 px-4 py-3 text-sm text-theme-success">
              Grading scale saved.
            </div>
          ) : null}

          <section className="rounded-xl border border-theme bg-theme-surface p-4">
            <h2 className="mb-3 text-sm font-semibold text-theme-primary">
              Principal subject bands
            </h2>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                <span>Min score</span>
                <span>Grade</span>
                <span>Points</span>
                <span className="sr-only">Remove</span>
              </div>
              {bands.map((band, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="ms-input"
                    value={band.minScore}
                    onChange={(e) =>
                      updateBand(index, { minScore: Number(e.target.value) })
                    }
                  />
                  <input
                    className="ms-input uppercase"
                    value={band.grade}
                    maxLength={3}
                    onChange={(e) => updateBand(index, { grade: e.target.value })}
                  />
                  <input
                    type="number"
                    min={0}
                    max={6}
                    className="ms-input"
                    value={band.points}
                    onChange={(e) =>
                      updateBand(index, { points: Number(e.target.value) })
                    }
                  />
                  <button
                    type="button"
                    className="ms-btn-ghost px-2 text-theme-danger"
                    onClick={() => removeBand(index)}
                    aria-label="Remove band"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addBand} className="ms-btn-ghost mt-3">
              <Plus className="h-4 w-4" />
              Add band
            </button>
          </section>

          <section className="rounded-xl border border-theme bg-theme-surface p-4">
            <h2 className="mb-3 text-sm font-semibold text-theme-primary">
              Subsidiary pass threshold
            </h2>
            <label className="block max-w-xs">
              <span className="mb-1 block text-xs text-theme-muted">
                Minimum score to pass a subsidiary (GP, Sub-Maths, ICT)
              </span>
              <input
                type="number"
                min={0}
                max={100}
                className="ms-input w-full"
                value={threshold}
                onChange={(e) => {
                  setThreshold(Number(e.target.value));
                  setSaved(false);
                }}
              />
            </label>
          </section>

          <div className="flex justify-end">
            <LoadingButton
              variant="primary"
              loading={save.isPending}
              onClick={() => void submit()}
            >
              Save grading scale
            </LoadingButton>
          </div>
        </>
      )}
    </div>
  );
}
