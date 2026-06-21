"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Smartphone } from "lucide-react";
import { SUBSCRIPTION_FEE_UGX } from "@makyschool/shared/constants";
import type {
  BillingQuote,
  CollectPaymentResult,
  PaymentStatusResult,
  SchoolRecord,
} from "@makyschool/shared/types";
import { Badge } from "@makyschool/ui/components/ui/Badge";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { Spinner } from "@makyschool/ui/components/ui/Spinner";
import { StatusBanner } from "@makyschool/ui/components/ui/StatusBanner";
import { apiClient } from "@/lib/api/client";
import { useSchool } from "@/providers/SchoolProvider";

const labelClass = "mb-2 block text-sm font-medium text-theme-muted";

type CheckoutPhase = "idle" | "processing" | "completed" | "failed";

function initialPhone(school: SchoolRecord | null, quote: BillingQuote | null) {
  const hint = quote?.phone_hint ?? school?.phone ?? "";
  return hint.replace(/^\+/, "");
}

function formatAmount(amount: number) {
  return `UGX ${amount.toLocaleString("en-UG")}`;
}

export function BillingCheckout({
  school,
  quote: initialQuote,
}: {
  school: SchoolRecord;
  quote: BillingQuote | null;
}) {
  const router = useRouter();
  const { schoolSlug } = useSchool();
  const [quote, setQuote] = useState<BillingQuote | null>(initialQuote);
  const [phone, setPhone] = useState(() => initialPhone(school, initialQuote));
  const [phase, setPhase] = useState<CheckoutPhase>(
    school.subscription_status === "active" ? "completed" : "idle",
  );
  const [reference, setReference] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const needsPayment =
    school.subscription_status === "unpaid" || school.subscription_status === "expired";

  const displayTerm = quote?.term ?? school.subscription_term ?? "Term 1";
  const displayYear = quote?.year ?? school.subscription_year ?? new Date().getFullYear();
  const amount = quote?.amount ?? SUBSCRIPTION_FEE_UGX;

  const statusTone = useMemo(() => {
    if (school.subscription_status === "active") return "success" as const;
    if (school.subscription_status === "expired") return "danger" as const;
    return "warning" as const;
  }, [school.subscription_status]);

  const pollPayment = useCallback(
    async (paymentReference: string) => {
      const maxAttempts = 40;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 3000));

        try {
          const response = await apiClient<PaymentStatusResult>(
            `/schools/billing/payments/${paymentReference}`,
            { schoolSlug },
          );

          if (response.data.status === "completed") {
            setPhase("completed");
            router.refresh();
            return;
          }

          if (response.data.status === "failed") {
            setPhase("failed");
            setError("Payment was not completed. You can try again.");
            return;
          }
        } catch {
          // Keep polling while the webhook or provider catches up.
        }
      }

      setPhase("failed");
      setError(
        "We have not confirmed your payment yet. If you approved it on your phone, wait a minute and refresh this page.",
      );
    },
    [router, schoolSlug],
  );

  useEffect(() => {
    if (!quote) {
      void apiClient<BillingQuote>("/schools/billing/quote", { schoolSlug })
        .then((response) => {
          setQuote(response.data);
          if (!phone.trim()) {
            setPhone(initialPhone(school, response.data));
          }
        })
        .catch(() => {
          // Quote is optional for display; collect will surface configuration errors.
        });
    }
  }, [phone, quote, school, schoolSlug]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await apiClient<CollectPaymentResult>("/schools/billing/collect", {
        method: "POST",
        schoolSlug,
        body: { phone_number: phone },
      });

      setReference(response.data.reference);
      setPhase("processing");
      void pollPayment(response.data.reference);
    } catch (submissionError) {
      const message =
        submissionError instanceof Error
          ? submissionError.message
          : "Could not start mobile money payment";
      setError(message);
      setPhase("failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="ms-panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-theme-muted">Current status</p>
            <h2 className="mt-1 text-lg font-semibold capitalize text-theme-primary">
              {school.subscription_status}
            </h2>
            <p className="mt-2 text-sm text-theme-muted">
              {displayTerm} {displayYear} · {formatAmount(amount)}
            </p>
          </div>
          <Badge tone={statusTone}>{school.subscription_status}</Badge>
        </div>
      </div>

      {phase === "completed" || school.subscription_status === "active" ? (
        <StatusBanner
          tone="success"
          message="Your subscription is active. You can return to the dashboard."
        />
      ) : null}

      {error ? <StatusBanner tone="error" message={error} onDismiss={() => setError(null)} /> : null}

      {needsPayment ? (
        <div className="ms-panel p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-theme-accent/10 text-theme-accent">
              <Smartphone className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-theme-primary">Pay with Mobile Money</h3>
              <p className="mt-1 text-sm leading-6 text-theme-muted">
                Enter your MTN or Airtel number. You will receive a prompt on your phone to approve
                UGX {amount.toLocaleString("en-UG")}.
              </p>
            </div>
          </div>

          {quote && !quote.configured ? (
            <div className="mt-5">
              <StatusBanner
                tone="info"
                message="Online payments are not configured yet. Contact platform support if this persists."
              />
            </div>
          ) : null}

          {phase === "processing" ? (
            <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-theme bg-input/40 px-6 py-8 text-center">
              <Spinner size="md" tone="accent" />
              <p className="text-sm font-medium text-theme-primary">Waiting for approval on your phone</p>
              <p className="max-w-sm text-sm leading-6 text-theme-muted">
                Check your mobile money app or USSD prompt and enter your PIN to approve the payment.
                {reference ? (
                  <>
                    {" "}
                    Reference: <span className="font-mono text-theme-primary">{reference.slice(0, 8)}…</span>
                  </>
                ) : null}
              </p>
            </div>
          ) : (
            <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-5">
              <label className="block">
                <span className={labelClass}>Mobile money number</span>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="0700 000 000"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="ms-input"
                  disabled={loading || (quote !== null && !quote.configured)}
                  required
                />
                <span className="mt-2 block text-xs text-theme-muted">
                  MTN (077, 078, 076, 039) or Airtel (070, 074, 075)
                </span>
              </label>

              <LoadingButton
                type="submit"
                loading={loading}
                loadingLabel="Starting payment…"
                className="w-full sm:w-auto"
                disabled={quote !== null && !quote.configured}
              >
                Pay {formatAmount(amount)}
              </LoadingButton>
            </form>
          )}
        </div>
      ) : null}

      <div className="rounded-xl border border-theme bg-theme-surface px-5 py-4 text-sm text-theme-muted">
        <p className="font-medium text-theme-primary">Need help?</p>
        <p className="mt-1 leading-6">
          Payments are processed securely via MakyPay. If you completed payment but still see this
          screen, wait a moment and refresh the page.
        </p>
      </div>
    </div>
  );
}
