"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api/client";
import { Badge } from "@/components/ui/Badge";

export function SchoolDetail({ school, subscriptionHistory, counts, setupStatus }: {
  school: {
    id: string;
    slug: string;
    name: string | null;
    status: string;
    subscription_status: string;
    subscription_term: string | null;
    subscription_year: number | null;
    school_type: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    logo_url: string | null;
    stamp_url: string | null;
    schoolpay_code: string | null;
  };
  subscriptionHistory: Array<{ id: string; amount: number; term: string; year: number; schoolpay_ref: string | null; paid_at: string }>;
  counts: { classes: number; teachers: number; students: number };
  setupStatus?: {
    profileComplete: boolean;
    academicYearComplete: boolean;
    gradingScaleComplete: boolean;
  };
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"overview" | "subscription" | "settings">("overview");
  const [loading, setLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const nextStatus = useMemo(() => (school.status === "active" ? "suspended" : "active"), [school.status]);

  async function toggleStatus() {
    setLoading(true);
    try {
      await apiClient(`/superadmin/schools/${school.id}/status`, {
        method: "PATCH",
        body: { status: nextStatus },
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function recordManualPayment(formData: FormData) {
    setLoading(true);
    setPaymentError(null);
    try {
      const amount = Number(formData.get("amount"));
      const term = String(formData.get("term") ?? "").trim();
      const year = Number(formData.get("year"));

      if (!amount || !term || !year) {
        throw new Error("Amount, term, and year are required");
      }

      await apiClient(`/superadmin/schools/${school.id}/subscription`, {
        method: "POST",
        body: {
          amount,
          term,
          year,
          schoolpayRef: String(formData.get("schoolpayRef") ?? ""),
        },
      });
      router.refresh();
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "Failed to record payment");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-slate-900">{school.name ?? "Unnamed school"}</h1>
              <Badge tone={school.status === "active" ? "success" : school.status === "setup" ? "warning" : "danger"}>{school.status}</Badge>
              <Badge tone={school.subscription_status === "active" ? "success" : school.subscription_status === "expired" ? "danger" : "warning"}>{school.subscription_status}</Badge>
            </div>
            <p className="mt-2 text-sm text-slate-600">{school.slug}.makyschool.com</p>
          </div>
          <button onClick={() => void toggleStatus()} disabled={loading} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-70">
            {school.status === "active" ? "Suspend" : "Activate"}
          </button>
        </div>
      </div>

      <div className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {(["overview", "subscription", "settings"] as const).map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${tab === item ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            {item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Classes</p><p className="mt-2 text-3xl font-semibold text-slate-900">{counts.classes}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Teachers</p><p className="mt-2 text-3xl font-semibold text-slate-900">{counts.teachers}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Students</p><p className="mt-2 text-3xl font-semibold text-slate-900">{counts.students}</p></div>
          <div className="md:col-span-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">Setup Wizard</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3 text-sm">
              <div className="rounded-xl border border-slate-200 p-4">
                Profile {setupStatus?.profileComplete ? "complete" : "pending"}
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                Academic year {setupStatus?.academicYearComplete ? "complete" : "pending"}
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                Grading scale {setupStatus?.gradingScaleComplete ? "complete" : "pending"}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "subscription" ? (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Current Term</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{school.subscription_term ?? "No active term"} {school.subscription_year ?? ""}</p>
            </div>
            <form action={(formData) => { void recordManualPayment(formData); }} className="flex flex-wrap gap-2">
              <input name="amount" type="number" required placeholder="Amount" className="w-28 rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              <input name="term" required placeholder="Term" className="w-32 rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              <input name="year" type="number" required placeholder="Year" className="w-24 rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              <input name="schoolpayRef" placeholder="Reference" className="w-40 rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              <button disabled={loading} type="submit" className="rounded-xl bg-indigo-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-70">Record Manual Payment</button>
            </form>
          </div>
          {paymentError ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{paymentError}</div> : null}
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Term</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Reference</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subscriptionHistory.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3 text-sm text-slate-600">{new Date(entry.paid_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{entry.term} {entry.year}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">UGX {entry.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{entry.schoolpay_ref ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "settings" ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ["Email", school.email ?? "-"] as const,
            ["Phone", school.phone ?? "-"] as const,
            ["Address", school.address ?? "-"] as const,
            ["School Type", school.school_type ?? "-"] as const,
            ["SchoolPay Code", school.schoolpay_code ?? "-"] as const,
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-2 text-base font-medium text-slate-900">{value}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}