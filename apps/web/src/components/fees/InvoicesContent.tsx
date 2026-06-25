"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AddInvoicePanel } from "@/components/fees/AddInvoicePanel";
import { FeesStatStrip } from "@/components/fees/FeesStatStrip";
import { CanDo } from "@/components/ui/CanDo";
import { DataListPanel } from "@makyschool/ui/components/ui/DataListPanel";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { FilterField } from "@makyschool/ui/components/ui/FilterField";
import { FilterSegment } from "@makyschool/ui/components/ui/FilterSegment";
import { ListToolbar } from "@makyschool/ui/components/ui/ListToolbar";
import { PageHeader } from "@makyschool/ui/components/ui/PageHeader";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { TablePagination } from "@makyschool/ui/components/ui/TablePagination";
import { cn } from "@makyschool/ui/lib/cn";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useApiSWR } from "@/hooks/useApiSWR";
import { useFeesBasePath } from "@/hooks/useFeesBasePath";
import { formatUGX } from "@/lib/formatCurrency";
import { invoiceStatusBadgeClass, type InvoiceListResponse, type InvoiceStatus } from "@/lib/fees/types";

const PAGE_SIZE = 25;

const STATUS_OPTIONS: Array<{ value: InvoiceStatus | ""; label: string }> = [
  { value: "", label: "All" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
  { value: "cancelled", label: "Cancelled" },
];

export function InvoicesContent() {
  const base = useFeesBasePath();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<InvoiceStatus | "">("");
  const [termName, setTermName] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 300);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (status) params.set("status", status);
    if (termName.trim()) params.set("term_name", termName.trim());
    if (academicYear.trim()) params.set("academic_year", academicYear.trim());
    return `/schools/fees/invoices?${params.toString()}`;
  }, [page, debouncedSearch, status, termName, academicYear]);

  const { data, error, isLoading, mutate } = useApiSWR<InvoiceListResponse>(query);
  const invoices = data?.invoices ?? [];
  const total = data?.total ?? 0;

  const stats = useMemo(() => {
    const unpaid = invoices.filter((row) => row.status === "unpaid").length;
    const outstanding = invoices.reduce((sum, row) => sum + (row.balance > 0 ? row.balance : 0), 0);
    return { unpaid, outstanding };
  }, [invoices]);

  const hasFilters = Boolean(debouncedSearch.trim() || status || termName.trim() || academicYear.trim());

  function clearFilters() {
    setSearch("");
    setStatus("");
    setTermName("");
    setAcademicYear("");
    setPage(1);
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Student fee invoices and outstanding balances."
        actions={
          <CanDo action="manageInvoices">
            <button type="button" className="ms-btn-primary inline-flex items-center gap-2" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              New invoice
            </button>
          </CanDo>
        }
      />

      <FeesStatStrip
        items={[
          { label: "Unpaid on page", value: stats.unpaid },
          { label: "Outstanding on page", value: formatUGX(stats.outstanding), tone: stats.outstanding > 0 ? "danger" : "default" },
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
            searchPlaceholder="Search invoice # or student"
            actions={
              hasFilters ? (
                <button type="button" className="ms-btn-ghost text-sm" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : null
            }
            filters={
              <>
                <FilterField label="Status" className="sm:col-span-2 lg:col-span-1">
                  <FilterSegment
                    value={status}
                    onChange={(value) => {
                      setStatus(value);
                      setPage(1);
                    }}
                    aria-label="Filter by invoice status"
                    options={STATUS_OPTIONS}
                  />
                </FilterField>
                <FilterField label="Term">
                  <input
                    className="ms-input ms-input-compact w-full"
                    placeholder="e.g. Term 1"
                    value={termName}
                    onChange={(e) => {
                      setTermName(e.target.value);
                      setPage(1);
                    }}
                  />
                </FilterField>
                <FilterField label="Year">
                  <input
                    type="number"
                    className="ms-input ms-input-compact w-full"
                    placeholder={String(new Date().getFullYear())}
                    value={academicYear}
                    onChange={(e) => {
                      setAcademicYear(e.target.value);
                      setPage(1);
                    }}
                  />
                </FilterField>
              </>
            }
          />
        }
        footer={
          total > PAGE_SIZE ? (
            <TablePagination
              summary={`Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total} invoices`}
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
                title={hasFilters ? "No invoices match your filters." : "No invoices yet."}
                description={
                  hasFilters
                    ? "Try different filters or clear them to see all invoices."
                    : "Create an invoice for one student or bulk-generate for a class."
                }
                action={
                  !hasFilters ? (
                    <CanDo action="manageInvoices">
                      <button type="button" className="ms-btn-primary" onClick={() => setAddOpen(true)}>
                        New invoice
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
          isEmpty={(payload) => payload.invoices.length === 0}
        >
          {(payload) => (
            <div className="overflow-x-auto">
              <table className="ms-table w-full min-w-[52rem]">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Student</th>
                    <th>Class</th>
                    <th>Term</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {payload.invoices.map((row) => (
                    <tr key={row.id}>
                      <td className="font-mono text-sm">
                        <Link href={`${base}/invoices/${row.id}`} className="text-theme-accent hover:underline">
                          {row.invoice_number}
                        </Link>
                        <div className="text-xs text-theme-muted">
                          {new Date(row.invoice_date).toLocaleDateString()}
                        </div>
                      </td>
                      <td>
                        <div className="font-medium">{row.student_name}</div>
                        {row.learner_id ? <div className="text-xs text-theme-muted">{row.learner_id}</div> : null}
                      </td>
                      <td className="text-sm">{row.class_name ?? "—"}</td>
                      <td className="text-sm whitespace-nowrap">
                        {row.term_name} {row.academic_year}
                      </td>
                      <td className="tabular-nums">{formatUGX(row.total_amount)}</td>
                      <td className="tabular-nums">{formatUGX(row.amount_paid)}</td>
                      <td className={cn("tabular-nums font-medium", row.balance > 0 && "text-theme-danger")}>
                        {formatUGX(row.balance)}
                      </td>
                      <td>
                        <span className={cn("badge capitalize", invoiceStatusBadgeClass(row.status))}>{row.status}</span>
                      </td>
                      <td>
                        <Link href={`${base}/invoices/${row.id}`} className="text-sm text-theme-accent hover:underline">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryState>
      </DataListPanel>

      <AddInvoicePanel open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => void mutate()} />
    </section>
  );
}
