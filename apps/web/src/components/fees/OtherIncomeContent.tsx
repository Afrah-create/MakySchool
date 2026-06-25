"use client";

import { Fragment, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { ConfirmDialog } from "@makyschool/ui/components/ui/ConfirmDialog";
import { DataListPanel } from "@makyschool/ui/components/ui/DataListPanel";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { FilterField } from "@makyschool/ui/components/ui/FilterField";
import { FilterSegment } from "@makyschool/ui/components/ui/FilterSegment";
import { ListToolbar } from "@makyschool/ui/components/ui/ListToolbar";
import { PageHeader } from "@makyschool/ui/components/ui/PageHeader";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { TablePagination } from "@makyschool/ui/components/ui/TablePagination";
import { AddOtherIncomePanel } from "@/components/fees/AddOtherIncomePanel";
import { FeesStatStrip } from "@/components/fees/FeesStatStrip";
import { PdfDownloadButton } from "@/components/fees/PdfDownloadButton";
import { CanDo } from "@/components/ui/CanDo";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useApiSWR } from "@/hooks/useApiSWR";
import { apiClient } from "@/lib/api/client";
import { formatUGX } from "@/lib/formatCurrency";
import {
  paymentMethodLabel,
  type OtherIncomeListResponse,
  type OtherIncomeRecord,
  type PaymentMethod,
} from "@/lib/fees/types";
import { useToast } from "@/providers/ToastProvider";

const PAGE_SIZE = 25;

const METHOD_OPTIONS: Array<{ value: PaymentMethod | ""; label: string }> = [
  { value: "", label: "All" },
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank" },
  { value: "mobile_money", label: "Mobile" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

export function OtherIncomeContent() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [addOpen, setAddOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<OtherIncomeRecord | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 300);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (paymentMethod) params.set("payment_method", paymentMethod);
    return `/schools/fees/other-income?${params.toString()}`;
  }, [page, debouncedSearch, paymentMethod]);

  const { data, error, isLoading, mutate } = useApiSWR<OtherIncomeListResponse>(query);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const activeTotal = items.filter((row) => !row.voided).reduce((sum, row) => sum + row.total_amount, 0);

  const detailQuery = expandedId ? `/schools/fees/other-income/${expandedId}` : null;
  const { data: detail } = useApiSWR<OtherIncomeRecord>(detailQuery);

  async function handleVoid() {
    if (!voidTarget || !voidReason.trim()) return;
    setVoiding(true);
    try {
      await apiClient(`/schools/fees/other-income/${voidTarget.id}/void`, {
        method: "POST",
        body: { reason: voidReason.trim() },
      });
      toast.success(`Income ${voidTarget.reference_number} voided.`);
      setVoidTarget(null);
      setVoidReason("");
      void mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to void income.");
    } finally {
      setVoiding(false);
    }
  }

  const hasFilters = Boolean(debouncedSearch.trim() || paymentMethod);

  function clearFilters() {
    setSearch("");
    setPaymentMethod("");
    setPage(1);
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Other income"
        description="Non-fee income such as donations, grants, and sales."
        actions={
          <CanDo action="manageOtherIncome">
            <button type="button" className="ms-btn-primary inline-flex items-center gap-2" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Record income
            </button>
          </CanDo>
        }
      />

      <FeesStatStrip
        items={[
          { label: "Records on page", value: items.length },
          { label: "Page total (active)", value: formatUGX(activeTotal) },
          { label: "Total matching", value: total },
        ]}
      />

      <DataListPanel
        toolbar={
          <ListToolbar
            searchValue={search}
            onSearchChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            searchPlaceholder="Search reference or description"
            actions={
              hasFilters ? (
                <button type="button" className="ms-btn-ghost text-sm" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : null
            }
            filters={
              <FilterField label="Payment method" className="sm:col-span-2 lg:col-span-1">
                <FilterSegment
                  value={paymentMethod}
                  onChange={(value) => {
                    setPaymentMethod(value);
                    setPage(1);
                  }}
                  aria-label="Filter by payment method"
                  options={METHOD_OPTIONS}
                />
              </FilterField>
            }
          />
        }
        footer={
          total > PAGE_SIZE ? (
            <TablePagination
              summary={`Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total} records`}
              onPrevious={() => setPage((p) => p - 1)}
              onNext={() => setPage((p) => p + 1)}
              previousDisabled={page <= 1}
              nextDisabled={page * PAGE_SIZE >= total}
            />
          ) : null
        }
      >
        <QueryState
          error={error}
          isLoading={isLoading}
          data={data}
          onRetry={() => void mutate()}
          loading={<Skeleton className="m-4 h-48" />}
          empty={
            <div className="p-6">
              <EmptyState
                title={hasFilters ? "No income matches your filters." : "No other income recorded yet."}
                description={
                  hasFilters
                    ? "Try different filters or clear them to see all records."
                    : "Record donations, grants, or other non-fee income."
                }
                action={
                  !hasFilters ? (
                    <CanDo action="manageOtherIncome">
                      <button type="button" className="ms-btn-primary" onClick={() => setAddOpen(true)}>
                        Record income
                      </button>
                    </CanDo>
                  ) : (
                    <button type="button" className="ms-btn-secondary" onClick={clearFilters}>
                      Clear filters
                    </button>
                  )
                }
              />
            </div>
          }
          isEmpty={(payload) => payload.items.length === 0}
        >
          {() => (
            <div className="overflow-x-auto">
              <table className="ms-table w-full min-w-[48rem]">
                <thead>
                  <tr>
                    <th className="w-8" />
                    <th>Reference</th>
                    <th>Description</th>
                    <th>Source</th>
                    <th className="text-right">Amount</th>
                    <th>Method</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <Fragment key={row.id}>
                      <tr className={row.voided ? "opacity-60" : undefined}>
                        <td>
                          <button
                            type="button"
                            className="flex h-6 w-6 items-center justify-center rounded-md text-xs text-theme-muted hover:bg-nav-hover"
                            onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                            aria-expanded={expandedId === row.id}
                          >
                            {expandedId === row.id ? "−" : "+"}
                          </button>
                        </td>
                        <td className="font-mono text-sm">{row.reference_number}</td>
                        <td className="max-w-[12rem] truncate">{row.description}</td>
                        <td>{row.source_name ?? "—"}</td>
                        <td className="text-right tabular-nums">{formatUGX(row.total_amount)}</td>
                        <td>{paymentMethodLabel(row.payment_method)}</td>
                        <td className="whitespace-nowrap">{new Date(row.income_date).toLocaleDateString()}</td>
                        <td>{row.voided ? <span className="text-theme-danger">Voided</span> : "Active"}</td>
                        <td>
                          <div className="flex gap-2">
                            <PdfDownloadButton path={`/schools/fees/other-income/${row.id}/receipt`} />
                            <CanDo action="voidIncome">
                              {!row.voided ? (
                                <button
                                  type="button"
                                  className="text-xs text-theme-danger hover:underline"
                                  onClick={() => setVoidTarget(row)}
                                >
                                  Void
                                </button>
                              ) : null}
                            </CanDo>
                          </div>
                        </td>
                      </tr>
                      {expandedId === row.id && detail?.id === row.id ? (
                        <tr>
                          <td colSpan={9} className="bg-theme-surface-raised">
                            <div className="space-y-2 p-4 text-sm">
                              <p className="font-medium text-theme-primary">Line items</p>
                              <ul className="divide-y divide-theme rounded-lg border border-theme">
                                {(detail.items ?? []).map((item, index) => (
                                  <li key={item.id ?? index} className="flex justify-between gap-4 px-3 py-2">
                                    <span>
                                      {item.description}
                                      {item.account_code ? (
                                        <span className="ml-2 text-xs text-theme-muted">({item.account_code})</span>
                                      ) : null}
                                    </span>
                                    <span className="shrink-0 tabular-nums">{formatUGX(item.amount)}</span>
                                  </li>
                                ))}
                              </ul>
                              {detail.notes ? <p className="text-theme-muted">Notes: {detail.notes}</p> : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryState>
      </DataListPanel>

      <AddOtherIncomePanel open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => void mutate()} />

      <ConfirmDialog
        open={Boolean(voidTarget)}
        title="Void income record?"
        description={
          voidTarget
            ? `Void ${voidTarget.reference_number} (${formatUGX(voidTarget.total_amount)})? This cannot be undone.`
            : ""
        }
        confirmLabel="Void income"
        variant="danger"
        loading={voiding}
        requiresText="VOID"
        onCancel={() => {
          setVoidTarget(null);
          setVoidReason("");
        }}
        onConfirm={() => void handleVoid()}
      >
        <label className="block">
          <span className="mb-1 block text-xs text-theme-muted">Reason *</span>
          <textarea
            className="ms-input w-full"
            rows={3}
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
          />
        </label>
      </ConfirmDialog>
    </section>
  );
}
