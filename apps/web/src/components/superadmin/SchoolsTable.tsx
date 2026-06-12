"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import {
  Banknote,
  Building2,
  CheckCircle2,
  Plus,
  Search,
  Settings2,
} from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { Skeleton } from "@/components/ui/Skeleton";
import { AddSchoolPanel } from "@/components/superadmin/AddSchoolPanel";

type SchoolsPayload = {
  items: Array<{
    id: string;
    name: string | null;
    slug: string;
    status: string;
    subscription_status: string;
    school_type: string | null;
    created_at: string;
    admin_email: string;
  }>;
  stats: {
    total_schools: number;
    active_schools: number;
    setup_schools: number;
    revenue_current_term: number;
  };
};

function statusBadgeClass(status: string) {
  if (status === "active") return "badge-success";
  if (status === "setup") return "badge-info";
  return "badge-danger";
}

function subscriptionBadgeClass(status: string) {
  if (status === "active") return "badge-success";
  if (status === "expired") return "badge-danger";
  return "badge-info";
}

const statCards = [
  {
    key: "total",
    label: "Total schools",
    icon: Building2,
    getValue: (stats?: SchoolsPayload["stats"]) => stats?.total_schools ?? 0,
    format: (value: number) => String(value),
  },
  {
    key: "active",
    label: "Active",
    icon: CheckCircle2,
    getValue: (stats?: SchoolsPayload["stats"]) => stats?.active_schools ?? 0,
    format: (value: number) => String(value),
  },
  {
    key: "setup",
    label: "In setup",
    icon: Settings2,
    getValue: (stats?: SchoolsPayload["stats"]) => stats?.setup_schools ?? 0,
    format: (value: number) => String(value),
  },
  {
    key: "revenue",
    label: "Revenue",
    icon: Banknote,
    getValue: (stats?: SchoolsPayload["stats"]) => stats?.revenue_current_term ?? 0,
    format: (value: number) => `UGX ${value.toLocaleString()}`,
  },
] as const;

export function SchoolsTable() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const { data, error, isLoading, mutate } = useSWR(
    `/superadmin/schools?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`,
    async (path) => apiClient<SchoolsPayload>(path).then((response) => response.data),
  );

  const rows = data?.items ?? [];

  return (
    <section>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          const value = card.getValue(data?.stats);
          return (
            <div
              key={card.key}
              className="rounded-xl border border-theme bg-theme-surface p-5"
            >
              <div className="flex items-center justify-between">
                <Icon className="h-4 w-4 text-theme-accent" />
                <span className="text-xs font-medium uppercase tracking-wide text-theme-muted">
                  {card.label}
                </span>
              </div>
              <p className="mt-3 text-2xl font-semibold text-theme-primary">
                {card.format(value)}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-faint" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search schools"
            className="ms-input w-full py-2.5 pl-10 pr-4 focus:border-input-focus"
          />
        </div>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="ms-select w-full shrink-0 py-2.5 sm:w-auto focus:border-input-focus"
        >
          <option value="">All Statuses</option>
          <option value="setup">Setup</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <AddSchoolPanel onCreated={() => void mutate()} />
      </div>

      {isLoading ? (
        <div className="space-y-3 rounded-xl border border-theme bg-theme-surface p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-theme bg-theme-surface px-6 py-20 text-center">
          <Building2 className="mx-auto mb-4 h-10 w-10 text-theme-faint" />
          <h3 className="text-sm font-medium text-theme-primary">Could not load schools</h3>
          <p className="mt-1 text-sm text-theme-muted">Check the API connection and try again.</p>
          <button
            type="button"
            onClick={() => void mutate()}
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-theme px-4 py-2 text-sm text-theme-accent hover:bg-theme-accent-muted"
          >
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-theme bg-theme-surface px-6 py-20 text-center">
          <Building2 className="mx-auto mb-4 h-10 w-10 text-theme-faint" />
          <h3 className="text-sm font-medium text-theme-primary">No schools yet</h3>
          <p className="mt-1 text-sm text-theme-muted">Provision the first school to get started.</p>
          <button
            type="button"
            onClick={() => document.getElementById("add-school-trigger")?.click()}
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-theme px-4 py-2 text-sm text-theme-accent hover:bg-theme-accent-muted"
          >
            <Plus className="h-4 w-4" />
            Provision a school
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-table-header text-left text-xs font-medium uppercase tracking-wide text-theme-muted">
                <tr>
                  <th className="px-4 py-3">School</th>
                  <th className="px-4 py-3">Slug</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Subscription</th>
                  <th className="px-4 py-3">Added</th>
                  <th className="px-4 py-3 text-right"> </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((school) => (
                  <tr
                    key={school.id}
                    className="border-t border-theme transition hover:bg-theme-raised"
                  >
                    <td className="px-4 py-4">
                      <div className="font-medium text-theme-primary">{school.name ?? "Unnamed school"}</div>
                      <div className="text-sm text-theme-muted">{school.admin_email || "—"}</div>
                    </td>
                    <td className="px-4 py-4 text-sm text-theme-muted">{school.slug}</td>
                    <td className="px-4 py-4 text-sm text-theme-muted">{school.school_type ?? "—"}</td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusBadgeClass(school.status)}`}
                      >
                        {school.status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${subscriptionBadgeClass(school.subscription_status)}`}
                      >
                        {school.subscription_status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-theme-muted">
                      {new Date(school.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Link
                        href={`/superadmin/schools/${school.id}`}
                        className="text-xs text-theme-accent hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
