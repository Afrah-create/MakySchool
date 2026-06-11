"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api/client";
import { Badge } from "@/components/ui/Badge";
import { theme } from "@/lib/theme";

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
  const [settingsError, setSettingsError] = useState<string | null>(null);

  async function toggleSuspend() {
    setLoading(true);
    try {
      const status = school.status === "active" ? "suspended" : "active";
      await apiClient(`/superadmin/schools/${school.id}/status`, {
        method: "PATCH",
        body: { status },
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

  async function saveSchoolPayCode(formData: FormData) {
    setLoading(true);
    setSettingsError(null);
    try {
      const schoolpayCode = String(formData.get("schoolpayCode") ?? "").trim();
      if (!schoolpayCode) {
        throw new Error("SchoolPay code is required");
      }
      await apiClient(`/superadmin/schools/${school.id}`, {
        method: "PATCH",
        body: { schoolpayCode },
      });
      router.refresh();
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className={`${theme.panel} ${theme.panelPadding}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className={`text-2xl font-semibold ${theme.heading}`}>{school.name ?? "Unnamed school"}</h1>
              <Badge tone={school.status === "active" ? "success" : school.status === "setup" ? "warning" : "danger"}>{school.status}</Badge>
              <Badge tone={school.subscription_status === "active" ? "success" : school.subscription_status === "expired" ? "danger" : "warning"}>{school.subscription_status}</Badge>
            </div>
            <p className={`mt-2 text-sm ${theme.muted}`}>{school.slug}.makyschool.com</p>
          </div>
          {school.status === "active" || school.status === "suspended" ? (
            <button
              onClick={() => void toggleSuspend()}
              disabled={loading}
              className={school.status === "active" ? theme.btnGhost : theme.btnPrimary}
            >
              {school.status === "active" ? "Suspend" : "Reactivate"}
            </button>
          ) : null}
        </div>
      </div>

      <div className={`flex gap-2 ${theme.panel} p-2`}>
        {(["overview", "subscription", "settings"] as const).map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={`rounded-lg px-4 py-2 text-sm font-medium capitalize transition ${
              tab === item ? "bg-[#4F6EF7] text-white" : `text-[#8B90A7] hover:bg-[#252A3A]`
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="grid gap-4 md:grid-cols-3">
          <div className={`${theme.panel} ${theme.panelPadding}`}><p className={`text-sm ${theme.muted}`}>Classes</p><p className={`mt-2 text-3xl font-semibold ${theme.heading}`}>{counts.classes}</p></div>
          <div className={`${theme.panel} ${theme.panelPadding}`}><p className={`text-sm ${theme.muted}`}>Teachers</p><p className={`mt-2 text-3xl font-semibold ${theme.heading}`}>{counts.teachers}</p></div>
          <div className={`${theme.panel} ${theme.panelPadding}`}><p className={`text-sm ${theme.muted}`}>Students</p><p className={`mt-2 text-3xl font-semibold ${theme.heading}`}>{counts.students}</p></div>
          <div className={`md:col-span-3 ${theme.panel} ${theme.panelPadding}`}>
            <p className={`text-sm font-semibold ${theme.heading}`}>Setup</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3 text-sm">
              <div className={`rounded-lg border ${theme.divider} p-4 text-[#8B90A7]`}>Profile {setupStatus?.profileComplete ? "✓" : "—"}</div>
              <div className={`rounded-lg border ${theme.divider} p-4 text-[#8B90A7]`}>Academic year {setupStatus?.academicYearComplete ? "✓" : "—"}</div>
              <div className={`rounded-lg border ${theme.divider} p-4 text-[#8B90A7]`}>Grading {setupStatus?.gradingScaleComplete ? "✓" : "—"}</div>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "subscription" ? (
        <div className={`space-y-4 ${theme.panel} ${theme.panelPadding}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={`text-sm ${theme.muted}`}>Current term</p>
              <p className={`mt-1 text-lg font-semibold ${theme.heading}`}>{school.subscription_term ?? "—"} {school.subscription_year ?? ""}</p>
            </div>
            <form action={(formData) => { void recordManualPayment(formData); }} className="flex flex-wrap gap-2">
              <input name="amount" type="number" required placeholder="Amount" className={`w-28 ${theme.input}`} />
              <input name="term" required placeholder="Term" className={`w-32 ${theme.input}`} />
              <input name="year" type="number" required placeholder="Year" className={`w-24 ${theme.input}`} />
              <input name="schoolpayRef" placeholder="Reference" className={`w-40 ${theme.input}`} />
              <button disabled={loading} type="submit" className={theme.btnPrimary}>Record payment</button>
            </form>
          </div>
          {paymentError ? <div className="rounded-lg border border-[#252A3A] bg-[#0F1117] px-4 py-3 text-sm text-[#F0F2FA]">{paymentError}</div> : null}
          <div className={`overflow-hidden rounded-lg border ${theme.divider}`}>
            <table className={`min-w-full divide-y ${theme.divider}`}>
              <thead className={theme.tableHead}>
                <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Term</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Reference</th></tr>
              </thead>
              <tbody className={`divide-y ${theme.divider}`}>
                {subscriptionHistory.map((entry) => (
                  <tr key={entry.id}>
                    <td className={`px-4 py-3 text-sm ${theme.muted}`}>{new Date(entry.paid_at).toLocaleDateString()}</td>
                    <td className={`px-4 py-3 text-sm ${theme.muted}`}>{entry.term} {entry.year}</td>
                    <td className={`px-4 py-3 text-sm ${theme.muted}`}>UGX {entry.amount.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-sm ${theme.muted}`}>{entry.schoolpay_ref ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "settings" ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ["Email", school.email ?? "—"] as const,
              ["Phone", school.phone ?? "—"] as const,
              ["Address", school.address ?? "—"] as const,
              ["Type", school.school_type ?? "—"] as const,
            ].map(([label, value]) => (
              <div key={label} className={`${theme.panel} ${theme.panelPadding}`}>
                <p className={`text-sm ${theme.muted}`}>{label}</p>
                <p className={`mt-2 font-medium ${theme.heading}`}>{value}</p>
              </div>
            ))}
          </div>
          <div className={`${theme.panel} ${theme.panelPadding}`}>
            <p className={`text-sm font-medium ${theme.heading}`}>SchoolPay code</p>
            <p className={`mt-1 text-sm ${theme.muted}`}>Used to match incoming SchoolPay webhook payments.</p>
            <form action={(formData) => { void saveSchoolPayCode(formData); }} className="mt-4 flex flex-wrap gap-2">
              <input
                name="schoolpayCode"
                defaultValue={school.schoolpay_code ?? ""}
                placeholder="Merchant code"
                className={`max-w-xs flex-1 ${theme.input}`}
              />
              <button disabled={loading} type="submit" className={theme.btnPrimary}>Save</button>
            </form>
            {settingsError ? <p className="mt-3 text-sm text-rose-400">{settingsError}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
