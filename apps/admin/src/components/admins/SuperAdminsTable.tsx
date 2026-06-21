"use client";

import { useState } from "react";
import { Mail, Plus, User } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { useApiSWR } from "@/hooks/useApiSWR";
import type { SuperAdminListItem } from "@makyschool/shared/types";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { SlideOver } from "@makyschool/ui/components/ui/SlideOver";
import { StatusBanner } from "@makyschool/ui/components/ui/StatusBanner";

const labelClass = "mb-2 block text-xs font-medium text-theme-muted";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-UG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function SuperAdminsTable() {
  const { data, error, isLoading, mutate } = useApiSWR<SuperAdminListItem[]>("/superadmin/admins");
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-theme-muted">
          Platform administrators can manage schools, billing settings, and other admins.
        </p>
        <button type="button" onClick={() => setPanelOpen(true)} className="ms-btn-primary inline-flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add admin
        </button>
      </div>

      <QueryState
        isLoading={isLoading}
        error={error}
        data={data}
        isEmpty={(items) => items.length === 0}
        onRetry={() => void mutate()}
        loading={<div className="ms-panel h-40 animate-pulse rounded-xl bg-theme-raised" />}
        empty={
          <EmptyState
            title="No platform admins"
            description="Add the first platform administrator."
            action={
              <button type="button" onClick={() => setPanelOpen(true)} className="ms-btn-primary">
                Add admin
              </button>
            }
          />
        }
      >
        {(items) => (
          <div className="ms-panel overflow-hidden">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-theme bg-theme-raised/60 text-xs uppercase tracking-wide text-theme-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme">
                {items.map((admin) => (
                  <tr key={admin.id} className="text-theme-primary">
                    <td className="px-5 py-4 font-medium">{admin.name}</td>
                    <td className="px-5 py-4 text-theme-muted">{admin.email}</td>
                    <td className="px-5 py-4 text-theme-muted">{formatDate(admin.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>

      <AddSuperAdminPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onCreated={() => void mutate()}
      />
    </>
  );
}

function AddSuperAdminPanel({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    try {
      await apiClient("/superadmin/admins", {
        method: "POST",
        body: { name, email, password },
      });
      onCreated();
      onClose();
      event.currentTarget.reset();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Failed to add admin");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SlideOver open={open} onClose={onClose} title="Add platform admin" description="Create another super admin account.">
      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        {error ? <StatusBanner tone="error" message={error} onDismiss={() => setError(null)} /> : null}

        <label className="block">
          <span className={labelClass}>Full name</span>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-faint" />
            <input name="name" required className="ms-input pl-10" placeholder="Platform Admin" />
          </div>
        </label>

        <label className="block">
          <span className={labelClass}>Email</span>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-faint" />
            <input name="email" type="email" required className="ms-input pl-10" placeholder="admin@example.com" />
          </div>
        </label>

        <label className="block">
          <span className={labelClass}>Password</span>
          <input name="password" type="password" required className="ms-input" autoComplete="new-password" />
          <span className="mt-1.5 block text-xs text-theme-faint">At least 8 characters with one number</span>
        </label>

        <label className="block">
          <span className={labelClass}>Confirm password</span>
          <input name="confirmPassword" type="password" required className="ms-input" autoComplete="new-password" />
        </label>

        <div className="flex gap-3 pt-2">
          <LoadingButton type="submit" loading={loading} loadingLabel="Creating…" className="flex-1">
            Create admin
          </LoadingButton>
          <button type="button" onClick={onClose} className="ms-btn-ghost">
            Cancel
          </button>
        </div>
      </form>
    </SlideOver>
  );
}
