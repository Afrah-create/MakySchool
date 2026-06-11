"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { apiClient } from "@/lib/api/client";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
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

function statusTone(status: string) {
  if (status === "active") return "success";
  if (status === "setup") return "warning";
  return "danger";
}

export function SchoolsTable() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const { data, error, isLoading, mutate } = useSWR(
    `/superadmin/schools?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`,
    async (path) => apiClient<SchoolsPayload>(path).then((response) => response.data),
  );

  const rows = data?.items ?? [];

  return (
    <section className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total Schools</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{data?.stats.total_schools ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Active Schools</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{data?.stats.active_schools ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Schools in Setup</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{data?.stats.setup_schools ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Revenue This Term</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">UGX {(data?.stats.revenue_current_term ?? 0).toLocaleString()}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 gap-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search schools"
            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
          >
            <option value="">All Statuses</option>
            <option value="setup">Setup</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        <AddSchoolPanel onCreated={() => void mutate()} />
      </div>

      {isLoading ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : error ? (
        <EmptyState title="Could not load schools" description="Check the API connection and try again." action={<button onClick={() => void mutate()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Retry</button>} />
      ) : rows.length === 0 ? (
        <EmptyState title="No schools yet" description="Provision the first school to start the multi-tenant workspace." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="sticky top-0 bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <th className="px-4 py-3">School</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Subscription</th>
                <th className="px-4 py-3">Added</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((school, index) => (
                <tr key={school.id} className={index % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                  <td className="px-4 py-4">
                    <div className="font-medium text-slate-900">{school.name ?? "Unnamed school"}</div>
                    <div className="text-sm text-slate-500">{school.admin_email || "No admin email"}</div>
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-600">{school.slug}</td>
                  <td className="px-4 py-4 text-sm text-slate-600">{school.school_type ?? "-"}</td>
                  <td className="px-4 py-4"><Badge tone={statusTone(school.status) as never}>{school.status}</Badge></td>
                  <td className="px-4 py-4"><Badge tone={school.subscription_status === "active" ? "success" : school.subscription_status === "expired" ? "danger" : "warning"}>{school.subscription_status}</Badge></td>
                  <td className="px-4 py-4 text-sm text-slate-600">{new Date(school.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-4 text-right">
                    <Link href={`/superadmin/schools/${school.id}`} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}