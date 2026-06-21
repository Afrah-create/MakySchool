"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertCircle, CheckCircle2, Play, RefreshCw } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { useApiSWR } from "@/hooks/useApiSWR";
import type { SubscriptionAuditOverview } from "@makyschool/shared/types";
import { Badge } from "@makyschool/ui/components/ui/Badge";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { StatusBanner } from "@makyschool/ui/components/ui/StatusBanner";

function statusTone(status: string) {
  if (status === "active") return "success" as const;
  if (status === "expired") return "danger" as const;
  return "warning" as const;
}

export function SubscriptionAuditsPanel() {
  const { data, error, isLoading, isValidating, mutate } =
    useApiSWR<SubscriptionAuditOverview>("/superadmin/subscriptions/overview");
  const [running, setRunning] = useState(false);
  const [actingSchoolId, setActingSchoolId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);

  async function runAudit() {
    setRunning(true);
    setBanner(null);
    try {
      const response = await apiClient<{ scanned: number; changed: number }>(
        "/superadmin/subscriptions/audit-run",
        { method: "POST" },
      );
      setBanner({
        tone: "success",
        message: `Audit complete. ${response.data.changed} of ${response.data.scanned} schools updated.`,
      });
      await mutate();
    } catch (submissionError) {
      setBanner({
        tone: "error",
        message: submissionError instanceof Error ? submissionError.message : "Audit failed",
      });
    } finally {
      setRunning(false);
    }
  }

  async function requirePayment(schoolId: string, schoolName: string | null) {
    setActingSchoolId(schoolId);
    setBanner(null);
    try {
      await apiClient(`/superadmin/subscriptions/schools/${schoolId}/require-payment`, {
        method: "POST",
      });
      setBanner({
        tone: "info",
        message: `${schoolName ?? "School"} must pay for the current term before access is restored.`,
      });
      await mutate();
    } catch (submissionError) {
      setBanner({
        tone: "error",
        message: submissionError instanceof Error ? submissionError.message : "Action failed",
      });
    } finally {
      setActingSchoolId(null);
    }
  }

  const summary = data?.summary;

  return (
    <section className="space-y-6">
      {banner ? (
        <StatusBanner
          tone={banner.tone}
          message={banner.message}
          onDismiss={() => setBanner(null)}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="ms-panel p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">Schools tracked</p>
          <p className="mt-2 text-2xl font-semibold text-theme-primary">{summary?.total ?? "—"}</p>
        </div>
        <div className="ms-panel p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">Payment required</p>
          <p className="mt-2 text-2xl font-semibold text-theme-primary">{summary?.needs_payment ?? "—"}</p>
        </div>
        <div className="ms-panel p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">Current term paid</p>
          <p className="mt-2 text-2xl font-semibold text-theme-primary">{summary?.active ?? "—"}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-theme-muted">
          Audits compare each school&apos;s paid term with the current academic term from their calendar.
          When a new term has started, schools are locked until they pay.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void mutate()}
            className="ms-btn-ghost inline-flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <LoadingButton
            loading={running}
            loadingLabel="Running audit…"
            onClick={() => void runAudit()}
            className="inline-flex items-center gap-2"
          >
            <Play className="h-4 w-4" />
            Run subscription audit
          </LoadingButton>
        </div>
      </div>

      <QueryState
        isLoading={isLoading}
        isValidating={isValidating}
        error={error}
        data={data}
        onRetry={() => void mutate()}
        isEmpty={(payload) => payload.items.length === 0}
        loading={<div className="ms-panel h-48 animate-pulse rounded-xl bg-theme-raised" />}
        empty={
          <EmptyState
            title="No schools to audit"
            description="Provision schools first, then run a subscription audit."
          />
        }
      >
        {(payload) => (
          <div className="ms-panel overflow-hidden">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-theme bg-theme-raised/60 text-xs uppercase tracking-wide text-theme-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">School</th>
                  <th className="px-5 py-3 font-medium">Paid term</th>
                  <th className="px-5 py-3 font-medium">Required term</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme">
                {payload.items.map((item) => (
                  <tr key={item.school_id}>
                    <td className="px-5 py-4">
                      <div className="font-medium text-theme-primary">{item.name ?? "Unnamed school"}</div>
                      <div className="text-xs text-theme-muted">{item.admin_email || item.slug}</div>
                    </td>
                    <td className="px-5 py-4 text-theme-muted">
                      {item.paid_term ? `${item.paid_term} ${item.paid_year ?? ""}` : "—"}
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-theme-primary">
                        {item.required_term} {item.required_year}
                      </div>
                      <div className="text-xs capitalize text-theme-faint">{item.term_source} calendar</div>
                    </td>
                    <td className="px-5 py-4">
                      {item.needs_payment ? (
                        <Badge tone="warning">
                          <span className="inline-flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Payment due
                          </span>
                        </Badge>
                      ) : (
                        <Badge tone="success">
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            {item.subscription_status}
                          </span>
                        </Badge>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/schools/${item.school_id}`}
                          className="text-xs font-medium text-theme-accent hover:underline"
                        >
                          Manage
                        </Link>
                        {item.needs_payment ? (
                          <LoadingButton
                            variant="ghost"
                            loading={actingSchoolId === item.school_id}
                            loadingLabel="Applying…"
                            onClick={() => void requirePayment(item.school_id, item.name)}
                            className="text-xs"
                          >
                            Require payment
                          </LoadingButton>
                        ) : (
                          <Badge tone={statusTone(item.subscription_status)}>
                            {item.subscription_status}
                          </Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>
    </section>
  );
}
