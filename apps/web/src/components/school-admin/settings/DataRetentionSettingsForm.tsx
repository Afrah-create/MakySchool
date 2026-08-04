"use client";

import { useEffect, useState } from "react";
import { Archive } from "lucide-react";
import type { DataRetentionSettings } from "@makyschool/shared/types";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { StatusBanner } from "@makyschool/ui/components/ui/StatusBanner";
import {
  SettingsFormFooter,
  SettingsSection,
} from "@/components/school-admin/settings/SettingsFormLayout";
import { apiClient } from "@/lib/api/client";
import { useToast } from "@/providers/ToastProvider";

export function DataRetentionSettingsForm({
  initial,
  onSaved,
}: {
  initial: DataRetentionSettings;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [hotYears, setHotYears] = useState(initial.hotYears);
  const [warmYears, setWarmYears] = useState(initial.warmYears);
  const [archiveAfterYears, setArchiveAfterYears] = useState(initial.archiveAfterYears);
  const [preview, setPreview] = useState(initial.preview ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHotYears(initial.hotYears);
    setWarmYears(initial.warmYears);
    setArchiveAfterYears(initial.archiveAfterYears);
    setPreview(initial.preview ?? []);
  }, [initial]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await apiClient<DataRetentionSettings>("/schools/settings/data-retention", {
        method: "PATCH",
        body: { hotYears, warmYears, archiveAfterYears },
      });
      setPreview(res.data.preview ?? []);
      toast.success("Data retention settings saved.");
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save settings.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <SettingsSection
        icon={Archive}
        title="Historical data visibility"
        description="Controls how years appear in the UI. Data is never deleted — archive only hides older years from primary selectors."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Hot years</span>
            <input
              type="number"
              min={1}
              max={20}
              className="ms-input w-full"
              value={hotYears}
              onChange={(e) => setHotYears(Number(e.target.value))}
            />
            <span className="text-xs text-theme-muted">Shown everywhere (incl. current)</span>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Warm years</span>
            <input
              type="number"
              min={0}
              max={20}
              className="ms-input w-full"
              value={warmYears}
              onChange={(e) => setWarmYears(Number(e.target.value))}
            />
            <span className="text-xs text-theme-muted">History / reference views</span>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Archive after</span>
            <input
              type="number"
              min={1}
              max={50}
              className="ms-input w-full"
              value={archiveAfterYears}
              onChange={(e) => setArchiveAfterYears(Number(e.target.value))}
            />
            <span className="text-xs text-theme-muted">Years older than this are archived</span>
          </label>
        </div>

        <StatusBanner
          tone="info"
          message={`Defaults keep roughly the latest ${hotYears} years hot, the next ${warmYears} warm, and anything beyond ${archiveAfterYears} years archived.`}
        />

        {preview.length > 0 ? (
          <ul className="mt-3 divide-y divide-theme rounded-lg border border-theme">
            {preview.map((y) => (
              <li key={y.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-medium text-theme-primary">
                  {y.year}
                  {y.isCurrent ? " · current" : ""}
                </span>
                <span className="capitalize text-theme-muted">{y.visibility}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </SettingsSection>

      {error ? (
        <div className="rounded-lg bg-theme-danger-bg px-3 py-2 text-sm text-theme-danger">{error}</div>
      ) : null}

      <SettingsFormFooter
        saving={saving}
        saveLabel="Save retention settings"
        onSave={() => void save()}
      />
    </div>
  );
}

export function DataRetentionSettingsLoader({ onSaved }: { onSaved?: () => void }) {
  const [data, setData] = useState<DataRetentionSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient<DataRetentionSettings>("/schools/settings/data-retention");
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return <p className="text-sm text-theme-muted">Loading retention settings…</p>;
  }
  if (error || !data) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-theme-danger">{error || "Unavailable"}</p>
        <LoadingButton variant="ghost" onClick={() => void load()}>
          Retry
        </LoadingButton>
      </div>
    );
  }

  return (
    <DataRetentionSettingsForm
      initial={data}
      onSaved={() => {
        void load();
        onSaved?.();
      }}
    />
  );
}
