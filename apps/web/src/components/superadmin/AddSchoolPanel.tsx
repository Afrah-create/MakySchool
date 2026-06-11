"use client";

import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import { SlideOver } from "@/components/ui/SlideOver";

export function AddSchoolPanel({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    setPassword(null);

    try {
      const payload = {
        schoolName: String(formData.get("schoolName") ?? "").trim(),
        adminName: String(formData.get("adminName") ?? "").trim(),
        adminEmail: String(formData.get("adminEmail") ?? "").trim(),
      };

      const response = await apiClient<{ school: { id: string }; tempPassword: string }>("/superadmin/schools", {
        method: "POST",
        body: payload,
      });

      setPassword(response.data.tempPassword);
      onCreated();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to provision school");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700">
        Add School
      </button>
      <SlideOver
        open={open}
        onClose={() => setOpen(false)}
        title="Provision a new school"
        description="Creates the school record, generates a slug, and issues the temporary admin password once."
      >
        <form
          className="space-y-4"
          action={(formData) => {
            void handleSubmit(formData);
          }}
        >
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">School Name</span>
            <input name="schoolName" required className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none ring-0 transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Admin Name</span>
            <input name="adminName" required className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none ring-0 transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Admin Email</span>
            <input type="email" name="adminEmail" required className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none ring-0 transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100" />
          </label>

          {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
          {password ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
              <p className="font-medium">Temporary password</p>
              <div className="mt-2 flex items-center gap-3">
                <code className="rounded-lg bg-white px-3 py-2 font-mono text-sm">{password}</code>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(password);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  }}
                  className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <button type="button" onClick={() => setPassword(null)} className="mt-3 text-xs font-medium text-emerald-700 underline">
                Dismiss
              </button>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
              Cancel
            </button>
            <button disabled={loading} type="submit" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-70">
              {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" /> : null}
              Provision School
            </button>
          </div>
        </form>
      </SlideOver>
    </>
  );
}