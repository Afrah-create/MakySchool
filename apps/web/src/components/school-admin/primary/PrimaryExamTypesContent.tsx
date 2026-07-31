"use client";

import { useState } from "react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { schoolOffersPrimary } from "@makyschool/shared";
import { useSchool } from "@/providers/SchoolProvider";
import { useToast } from "@/providers/ToastProvider";
import { primaryApi } from "@/lib/api/primary";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export function PrimaryExamTypesContent() {
  const { school } = useSchool();
  const offers = schoolOffersPrimary(school?.school_type);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: types = [], isPending } = useQuery({
    queryKey: ["primary", "exam-types"],
    queryFn: () => primaryApi.listExamTypes(),
    enabled: offers,
  });
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  if (!offers) {
    return (
      <DashboardPage embedded maxWidth="5xl" title="Exam types">
        <EmptyState title="Primary not enabled" description="Not available for secondary-only schools." />
      </DashboardPage>
    );
  }

  async function create() {
    if (!name.trim() || !code.trim()) {
      toast.error("Name and code are required.");
      return;
    }
    setSaving(true);
    try {
      await primaryApi.createExamType({
        name: name.trim(),
        code: code.trim().toUpperCase(),
        sortOrder: types.length + 1,
      });
      toast.success("Exam type created.");
      setName("");
      setCode("");
      await qc.invalidateQueries({ queryKey: ["primary", "exam-types"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardPage
      embedded
      maxWidth="5xl"
      eyebrow="Primary"
      title="Exam types"
      description="BOT, Mid-term, End of term, Mock — each exam is graded on its own."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 rounded-xl border border-theme bg-theme-surface p-4">
          <input
            className="ms-input"
            placeholder="Name (e.g. Mid Term)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="ms-input w-28"
            placeholder="Code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <LoadingButton loading={saving} onClick={() => void create()}>
            Add type
          </LoadingButton>
        </div>

        {isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-theme">
            <table className="min-w-full text-sm">
              <thead className="bg-theme-raised/50 text-[11px] uppercase text-theme-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Order</th>
                  <th className="px-3 py-2 text-left">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme">
                {types.map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-2 font-mono text-xs">{t.code}</td>
                    <td className="px-3 py-2 font-medium">{t.name}</td>
                    <td className="px-3 py-2">{t.sortOrder}</td>
                    <td className="px-3 py-2">{t.isActive ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardPage>
  );
}
