"use client";

import { useState } from "react";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { StatusBanner } from "@makyschool/ui/components/ui/StatusBanner";
import type { PlatformBillingSettings } from "@makyschool/shared/types";
import { apiClient } from "@/lib/api/client";

const labelClass = "mb-2 block text-xs font-medium text-theme-muted";

function formatUgx(amount: number) {
  return `UGX ${amount.toLocaleString("en-UG")}`;
}

export function SubscriptionFeeForm({ initial }: { initial: PlatformBillingSettings }) {
  const [settings, setSettings] = useState(initial);
  const [amount, setAmount] = useState(String(initial.subscription_fee_ugx));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const parsed = Number(amount.replace(/,/g, ""));
      const response = await apiClient<PlatformBillingSettings>("/superadmin/settings/billing", {
        method: "PATCH",
        body: { subscription_fee_ugx: parsed },
      });
      setSettings(response.data);
      setAmount(String(response.data.subscription_fee_ugx));
      setSuccess("Subscription fee updated for all schools.");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Failed to update fee");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ms-panel p-6">
      <h2 className="text-base font-semibold text-theme-primary">Termly subscription fee</h2>
      <p className="mt-1 text-sm text-theme-muted">
        Schools pay this amount each term via Mobile Money. Current fee:{" "}
        <span className="font-medium text-theme-primary">{formatUgx(settings.subscription_fee_ugx)}</span>.
      </p>

      <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-4">
        {error ? <StatusBanner tone="error" message={error} onDismiss={() => setError(null)} /> : null}
        {success ? <StatusBanner tone="success" message={success} /> : null}

        <label className="block max-w-sm">
          <span className={labelClass}>Amount (UGX)</span>
          <input
            type="number"
            min={settings.min_ugx}
            max={settings.max_ugx}
            step={1000}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="ms-input"
            required
          />
          <span className="mt-2 block text-xs text-theme-muted">
            Allowed range: {formatUgx(settings.min_ugx)} – {formatUgx(settings.max_ugx)}
          </span>
        </label>

        {settings.updated_at ? (
          <p className="text-xs text-theme-faint">
            Last updated{" "}
            {new Date(settings.updated_at).toLocaleString("en-UG", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            {settings.updated_by?.name ? ` by ${settings.updated_by.name}` : ""}
          </p>
        ) : null}

        <LoadingButton type="submit" loading={loading} loadingLabel="Saving…">
          Save subscription fee
        </LoadingButton>
      </form>
    </div>
  );
}
