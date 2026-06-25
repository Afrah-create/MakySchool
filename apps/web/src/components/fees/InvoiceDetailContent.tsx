"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ConfirmDialog } from "@makyschool/ui/components/ui/ConfirmDialog";
import { DataListPanel } from "@makyschool/ui/components/ui/DataListPanel";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { PageHeader } from "@makyschool/ui/components/ui/PageHeader";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { cn } from "@makyschool/ui/lib/cn";
import { FeesStatStrip } from "@/components/fees/FeesStatStrip";
import { PdfDownloadButton } from "@/components/fees/PdfDownloadButton";
import { RecordInvoicePaymentPanel } from "@/components/fees/RecordInvoicePaymentPanel";
import { CanDo } from "@/components/ui/CanDo";
import { useApiSWR } from "@/hooks/useApiSWR";
import { useFeesBasePath } from "@/hooks/useFeesBasePath";
import { apiClient } from "@/lib/api/client";
import { formatUGX } from "@/lib/formatCurrency";
import { invoiceStatusBadgeClass, paymentMethodLabel, type InvoiceDetail } from "@/lib/fees/types";
import { useToast } from "@/providers/ToastProvider";

export function InvoiceDetailContent({ invoiceId }: { invoiceId: string }) {
  const base = useFeesBasePath();
  const { toast } = useToast();
  const { data, error, isLoading, mutate } = useApiSWR<InvoiceDetail>(`/schools/fees/invoices/${invoiceId}`);
  const [payOpen, setPayOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const canPay = data && data.balance > 0 && !["cancelled", "voided", "paid"].includes(data.status);
  const canCancel = data && data.status === "unpaid" && (data.payments?.length ?? 0) === 0;

  async function handleCancel() {
    if (!cancelReason.trim()) return;
    setCancelling(true);
    try {
      await apiClient(`/schools/fees/invoices/${invoiceId}/cancel`, {
        method: "POST",
        body: { reason: cancelReason.trim() },
      });
      toast.success(`Invoice ${data?.invoice_number} cancelled.`);
      setCancelOpen(false);
      setCancelReason("");
      void mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel invoice.");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <section className="space-y-6">
      <Link
        href={`${base}/invoices`}
        className="inline-flex items-center gap-1.5 text-sm text-theme-muted transition hover:text-theme-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to invoices
      </Link>

      <QueryState
        error={error}
        isLoading={isLoading}
        data={data}
        onRetry={() => void mutate()}
        loading={<Skeleton className="h-64" />}
      >
        {(invoice) => (
          <>
            <PageHeader
              title={invoice.invoice_number}
              description={
                <div className="space-y-1">
                  <p>
                    {invoice.student_name}
                    {invoice.class_name ? ` · ${invoice.class_name}` : ""}
                    {invoice.learner_id ? (
                      <span className="ml-1 text-theme-muted">({invoice.learner_id})</span>
                    ) : null}
                  </p>
                  <p>
                    {invoice.term_name} {invoice.academic_year}
                    {invoice.due_date ? (
                      <span className="text-theme-muted">
                        {" "}
                        · Due {new Date(invoice.due_date).toLocaleDateString()}
                      </span>
                    ) : null}
                  </p>
                </div>
              }
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("badge capitalize", invoiceStatusBadgeClass(invoice.status))}>
                    {invoice.status}
                  </span>
                  <PdfDownloadButton
                    path={`/schools/fees/invoices/${invoiceId}/pdf`}
                    label="PDF"
                    className="ms-btn-secondary text-sm"
                  />
                  <CanDo action="recordPayments">
                    {canPay ? (
                      <button type="button" className="ms-btn-primary" onClick={() => setPayOpen(true)}>
                        Record payment
                      </button>
                    ) : null}
                  </CanDo>
                  <CanDo action="manageInvoices">
                    {canCancel ? (
                      <button
                        type="button"
                        className="ms-btn-secondary text-theme-danger"
                        onClick={() => setCancelOpen(true)}
                      >
                        Cancel
                      </button>
                    ) : null}
                  </CanDo>
                </div>
              }
            />

            <FeesStatStrip
              items={[
                { label: "Total", value: formatUGX(invoice.total_amount) },
                { label: "Paid", value: formatUGX(invoice.amount_paid), tone: "success" },
                {
                  label: "Balance",
                  value: formatUGX(invoice.balance),
                  tone: invoice.balance > 0 ? "danger" : "success",
                },
              ]}
            />

            {invoice.notes ? (
              <p className="rounded-xl border border-theme bg-theme-surface px-4 py-3 text-sm text-theme-muted">
                <span className="font-medium text-theme-primary">Notes: </span>
                {invoice.notes}
              </p>
            ) : null}

            <DataListPanel>
              <div className="border-b border-theme px-4 py-3 sm:px-5">
                <h2 className="text-sm font-semibold text-theme-primary">Line items</h2>
              </div>
              {invoice.items.length === 0 ? (
                <div className="p-6">
                  <EmptyState title="No line items." description="This invoice has no charge breakdown." />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="ms-table w-full min-w-[36rem]">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th>Account</th>
                        <th className="text-right">Qty</th>
                        <th className="text-right">Unit</th>
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.items.map((item) => (
                        <tr key={item.id ?? item.description}>
                          <td>{item.description}</td>
                          <td className="font-mono text-sm">{item.account_code ?? "—"}</td>
                          <td className="text-right tabular-nums">{item.quantity}</td>
                          <td className="text-right tabular-nums">{formatUGX(item.unit_amount)}</td>
                          <td className="text-right tabular-nums font-medium">{formatUGX(item.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </DataListPanel>

            <DataListPanel>
              <div className="border-b border-theme px-4 py-3 sm:px-5">
                <h2 className="text-sm font-semibold text-theme-primary">Payments</h2>
              </div>
              {(invoice.payments?.length ?? 0) === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="No payments yet."
                    description={
                      canPay
                        ? "Record a payment against this invoice when fees are collected."
                        : "Payments linked to this invoice will appear here."
                    }
                    action={
                      canPay ? (
                        <CanDo action="recordPayments">
                          <button type="button" className="ms-btn-primary" onClick={() => setPayOpen(true)}>
                            Record payment
                          </button>
                        </CanDo>
                      ) : undefined
                    }
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="ms-table w-full min-w-[32rem]">
                    <thead>
                      <tr>
                        <th>Receipt</th>
                        <th className="text-right">Amount</th>
                        <th>Method</th>
                        <th>Date</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.payments.map((payment) => (
                        <tr key={payment.id} className={payment.voided ? "opacity-60" : undefined}>
                          <td className="font-mono text-sm">{payment.receipt_number}</td>
                          <td className="text-right tabular-nums">{formatUGX(payment.amount)}</td>
                          <td>{paymentMethodLabel(payment.payment_method)}</td>
                          <td className="whitespace-nowrap">
                            {new Date(payment.payment_date).toLocaleDateString()}
                          </td>
                          <td>{payment.voided ? <span className="text-theme-danger">Voided</span> : "Active"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </DataListPanel>

            <RecordInvoicePaymentPanel
              open={payOpen}
              invoice={invoice}
              onClose={() => setPayOpen(false)}
              onPaid={() => {
                void mutate();
                setPayOpen(false);
              }}
            />

            <ConfirmDialog
              open={cancelOpen}
              title="Cancel invoice?"
              description={`Cancel ${invoice.invoice_number}? This cannot be undone.`}
              confirmLabel="Cancel invoice"
              variant="danger"
              loading={cancelling}
              onCancel={() => {
                setCancelOpen(false);
                setCancelReason("");
              }}
              onConfirm={() => void handleCancel()}
            >
              <label className="block">
                <span className="mb-1 block text-xs text-theme-muted">Reason *</span>
                <textarea
                  className="ms-input w-full"
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
              </label>
            </ConfirmDialog>
          </>
        )}
      </QueryState>
    </section>
  );
}
