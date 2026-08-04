"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Receipt } from "lucide-react";
import {
  BulkRecordPaymentPanel,
  RecordPaymentSuccessBanner,
} from "@/components/fees/BulkRecordPaymentPanel";
import { FeeStatusBadge } from "@/components/fees/FeeStatusBadge";
import { FeesStatStrip } from "@/components/fees/FeesStatStrip";
import { PdfDownloadButton } from "@/components/fees/PdfDownloadButton";
import { DataListPanel } from "@makyschool/ui/components/ui/DataListPanel";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { FilterField } from "@makyschool/ui/components/ui/FilterField";
import { FilterSegment } from "@makyschool/ui/components/ui/FilterSegment";
import { ListToolbar } from "@makyschool/ui/components/ui/ListToolbar";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { TablePagination } from "@makyschool/ui/components/ui/TablePagination";
import { FeesPageShell } from "@/components/fees/FeesPageShell";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useApiSWR } from "@/hooks/useApiSWR";
import { apiClient } from "@/lib/api/client";
import { formatUGX, formatUGXInput, parseUGXInput } from "@/lib/formatCurrency";
import type {
  BulkRecordPaymentResult,
  InvoiceDetail,
  InvoiceItem,
  InvoiceSummary,
  OutstandingStudent,
  PaymentMethod,
  RecordPaymentResult,
  StudentFeeAccount,
} from "@/lib/fees/types";
import { paymentMethodLabel } from "@/lib/fees/types";
import type { ClassOption } from "@/lib/students/types";
import { useToast } from "@/providers/ToastProvider";
import { DEFAULT_PAGE_SIZE } from "@makyschool/shared/constants";

type OutstandingResponse = {
  students: OutstandingStudent[];
  summary: {
    total_students: number;
    total_outstanding: number;
    unpaid_count: number;
    partial_count: number;
  };
  page: number;
  total: number;
};

type SuccessState =
  | { mode: "single"; result: RecordPaymentResult }
  | { mode: "bulk"; result: BulkRecordPaymentResult };

type AllocationDraft = {
  invoice_item_id: string;
  description: string;
  balance: number;
  amount: number;
  selected: boolean;
};

function itemBalance(item: InvoiceItem) {
  if (typeof item.balance === "number") return item.balance;
  if (typeof item.amount_paid === "number") return Math.max(item.total_amount - item.amount_paid, 0);
  return item.total_amount;
}

function draftsFromInvoice(invoice: InvoiceDetail): AllocationDraft[] {
  const outstanding = (invoice.items ?? [])
    .filter((item) => item.id && itemBalance(item) > 0)
    .map((item) => ({
      invoice_item_id: item.id!,
      description: item.description,
      balance: itemBalance(item),
      amount: itemBalance(item),
      selected: true,
    }));
  if (outstanding.length > 0) return outstanding;
  return [
    {
      invoice_item_id: "",
      description: "Invoice balance",
      balance: invoice.balance,
      amount: invoice.balance,
      selected: true,
    },
  ];
}

export function RecordPaymentContent() {
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [classId, setClassId] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "unpaid" | "partial">("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const debouncedSearch = useDebouncedValue(search, 300);

  const [selectedStudentsMap, setSelectedStudentsMap] = useState<Map<string, OutstandingStudent>>(
    new Map(),
  );
  const [activeStudent, setActiveStudent] = useState<OutstandingStudent | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [drafts, setDrafts] = useState<AllocationDraft[]>([]);

  const invoiceId = searchParams.get("invoice_id");
  const preselectedStudentId = searchParams.get("student_id");

  const listQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(pageSize));
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (classId) params.set("class_id", classId);
    if (statusFilter) params.set("status", statusFilter);
    return `/schools/fees/outstanding?${params.toString()}`;
  }, [page, pageSize, debouncedSearch, classId, statusFilter]);

  const { data, error: listError, isLoading, mutate } = useApiSWR<OutstandingResponse>(listQuery);
  const { data: classes = [] } = useApiSWR<ClassOption[]>("/schools/classes");
  const { data: invoiceData } = useApiSWR<InvoiceDetail>(
    invoiceId ? `/schools/fees/invoices/${invoiceId}` : null,
  );

  const students = data?.students ?? [];
  const total = data?.total ?? 0;

  const selectedAccountIds = useMemo(
    () => new Set(selectedStudentsMap.keys()),
    [selectedStudentsMap],
  );

  const selectedStudents = useMemo(
    () => [...selectedStudentsMap.values()],
    [selectedStudentsMap],
  );

  const accountsQuery = activeStudent
    ? `/schools/fees/accounts/student/${activeStudent.student_id}`
    : null;
  const { data: accountsData } = useApiSWR<{ accounts: StudentFeeAccount[] }>(accountsQuery);
  const accounts = accountsData?.accounts ?? [];
  const activeAccount =
    accounts.find((item) => item.fee_structure_id === activeStudent?.fee_structure_id) ??
    accounts[0];

  const studentInvoicesQuery =
    activeStudent && !invoiceId
      ? `/schools/fees/invoices/student/${activeStudent.student_id}`
      : null;
  const { data: studentInvoicesData } = useApiSWR<{ invoices: InvoiceSummary[] }>(
    studentInvoicesQuery,
  );

  const linkedInvoiceId = useMemo(() => {
    if (invoiceId) return invoiceId;
    if (!activeStudent || !studentInvoicesData?.invoices) return null;
    const structureId = activeAccount?.fee_structure_id ?? activeStudent.fee_structure_id;
    const open = studentInvoicesData.invoices.find(
      (inv) =>
        inv.balance > 0 &&
        !["cancelled", "voided", "paid"].includes(inv.status) &&
        (!structureId || inv.fee_structure_id === structureId),
    );
    return open?.id ?? null;
  }, [
    invoiceId,
    activeStudent,
    studentInvoicesData?.invoices,
    activeAccount?.fee_structure_id,
  ]);

  const { data: linkedInvoiceData } = useApiSWR<InvoiceDetail>(
    linkedInvoiceId && !invoiceId ? `/schools/fees/invoices/${linkedInvoiceId}` : null,
  );
  const payInvoice = invoiceData ?? linkedInvoiceData ?? null;

  const allocationTotal = useMemo(
    () => drafts.filter((d) => d.selected).reduce((sum, d) => sum + (d.amount > 0 ? d.amount : 0), 0),
    [drafts],
  );

  const maxAmount = payInvoice?.balance ?? activeAccount?.balance ?? activeStudent?.balance ?? 0;
  const useItemAllocations = Boolean(payInvoice && (payInvoice.items?.length ?? 0) > 0);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, classId, statusFilter]);

  useEffect(() => {
    if (!preselectedStudentId || students.length === 0) return;
    const match = students.find((student) => student.student_id === preselectedStudentId);
    if (match) {
      setActiveStudent(match);
      setAmount(match.balance);
    }
  }, [preselectedStudentId, students]);

  useEffect(() => {
    if (!invoiceData) return;
    setActiveStudent({
      student_id: invoiceData.student_id,
      full_name: invoiceData.student_name,
      learner_id: invoiceData.learner_id ?? "",
      class_name: invoiceData.class_name ?? "",
      account_id: "",
      fee_structure_id: invoiceData.fee_structure_id ?? "",
      amount_owed: invoiceData.total_amount,
      amount_paid: invoiceData.amount_paid,
      balance: invoiceData.balance,
      status: invoiceData.status as OutstandingStudent["status"],
      term_name: invoiceData.term_name,
      academic_year: invoiceData.academic_year,
    });
  }, [invoiceData]);

  useEffect(() => {
    if (!payInvoice) {
      setDrafts([]);
      return;
    }
    const next = draftsFromInvoice(payInvoice);
    setDrafts(next);
    setAmount(next.filter((d) => d.selected).reduce((sum, d) => sum + d.amount, 0));
  }, [payInvoice?.id, payInvoice?.amount_paid, payInvoice?.balance]);

  useEffect(() => {
    if (!activeStudent || payInvoice) return;
    setAmount(activeStudent.balance);
  }, [activeStudent?.account_id, activeStudent?.balance, payInvoice]);

  useEffect(() => {
    if (!useItemAllocations) return;
    setAmount(allocationTotal);
  }, [allocationTotal, useItemAllocations]);

  function toggleSelect(student: OutstandingStudent) {
    setSelectedStudentsMap((current) => {
      const next = new Map(current);
      if (next.has(student.account_id)) next.delete(student.account_id);
      else next.set(student.account_id, student);
      return next;
    });
  }

  function toggleSelectAll() {
    const allOnPageSelected = students.every((student) =>
      selectedStudentsMap.has(student.account_id),
    );
    setSelectedStudentsMap((current) => {
      const next = new Map(current);
      if (allOnPageSelected) {
        for (const student of students) {
          next.delete(student.account_id);
        }
      } else {
        for (const student of students) {
          next.set(student.account_id, student);
        }
      }
      return next;
    });
  }

  function selectStudent(student: OutstandingStudent) {
    setActiveStudent(student);
    setAmount(student.balance);
    setError(null);
  }

  function updateDraft(id: string, patch: Partial<AllocationDraft>) {
    setDrafts((prev) => prev.map((row) => (row.invoice_item_id === id ? { ...row, ...patch } : row)));
  }

  async function submitSingle(event: React.FormEvent) {
    event.preventDefault();
    if (!activeStudent) return;

    const feeStructureId = activeAccount?.fee_structure_id ?? activeStudent.fee_structure_id;
    if (!feeStructureId?.trim()) {
      setError("Fee structure is missing for this student. Refresh the page and try again.");
      return;
    }

    let paymentAmount = amount;
    let allocations:
      | Array<{ invoice_item_id: string; amount: number }>
      | undefined;

    if (useItemAllocations) {
      const selected = drafts.filter((d) => d.selected && d.amount > 0);
      if (selected.length === 0) {
        setError("Select at least one fee category and enter an amount.");
        return;
      }
      for (const row of selected) {
        if (row.amount > row.balance) {
          setError(`Amount for “${row.description}” exceeds its outstanding balance.`);
          return;
        }
      }
      paymentAmount = selected.reduce((sum, row) => sum + row.amount, 0);
      if (selected.every((row) => row.invoice_item_id)) {
        allocations = selected.map((row) => ({
          invoice_item_id: row.invoice_item_id,
          amount: row.amount,
        }));
      }
    }

    if (paymentAmount <= 0 || paymentAmount > maxAmount) {
      setError(`Enter an amount up to ${formatUGX(maxAmount)}.`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await apiClient<RecordPaymentResult>("/schools/fees/payments", {
        method: "POST",
        body: {
          student_id: activeStudent.student_id,
          fee_structure_id: feeStructureId,
          amount: paymentAmount,
          payment_method: method,
          payment_reference: reference.trim() || undefined,
          payment_date: paymentDate,
          notes: notes.trim() || undefined,
          invoice_id: linkedInvoiceId || undefined,
          allocations,
        },
      });
      setSuccess({ mode: "single", result: response.data });
      toast.success(
        `Payment recorded for ${response.data.payment.student_name} — ${formatUGX(response.data.payment.amount)}`,
      );
      void mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment.");
    } finally {
      setLoading(false);
    }
  }

  function resetAfterSuccess() {
    setSuccess(null);
    setActiveStudent(null);
    setSelectedStudentsMap(new Map());
    setSearch("");
    setAmount(0);
    setReference("");
    setNotes("");
    void mutate();
  }

  if (success?.mode === "single") {
    const { payment, account, invoice } = success.result;
    const paidInFull = (invoice?.balance ?? account.balance) <= 0;
    return (
      <section className="mx-auto max-w-2xl space-y-6">
        <RecordPaymentSuccessBanner
          title="Payment recorded successfully"
          description={`Receipt ${payment.receipt_number} for ${payment.student_name}`}
        >
          <div className="rounded-xl border border-theme bg-theme-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-2xl font-semibold tabular-nums text-theme-primary">
                  {formatUGX(payment.amount)}
                </p>
                <p className="mt-1 text-sm text-theme-muted">
                  {payment.class_name} · {payment.term_name} · {paymentMethodLabel(payment.payment_method)}
                </p>
                {invoice ? (
                  <p className="mt-1 text-xs text-theme-muted">
                    Invoice {invoice.invoice_number} · {invoice.status} · balance{" "}
                    {formatUGX(invoice.balance)}
                  </p>
                ) : null}
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  paidInFull ? "bg-theme-success-text/15 text-theme-success-text" : "badge-warning"
                }`}
              >
                {paidInFull ? "Paid in full" : `Balance ${formatUGX(invoice?.balance ?? account.balance)}`}
              </span>
            </div>
            {(payment.allocations?.length ?? 0) > 0 ? (
              <ul className="mt-4 space-y-1 border-t border-theme pt-3">
                {payment.allocations!.map((row) => (
                  <li key={row.invoice_item_id} className="flex justify-between gap-3 text-sm">
                    <span className="text-theme-muted">{row.description ?? "Fee item"}</span>
                    <span className="tabular-nums font-medium">{formatUGX(row.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <PdfDownloadButton
              path={`/schools/fees/receipts/${payment.id}`}
              label="Download receipt PDF"
              className="ms-btn-primary flex-1 justify-center text-center"
            />
            <button type="button" className="ms-btn-secondary flex-1" onClick={resetAfterSuccess}>
              Record another payment
            </button>
          </div>
        </RecordPaymentSuccessBanner>
      </section>
    );
  }

  if (success?.mode === "bulk") {
    const { recorded, failed, summary } = success.result;
    return (
      <section className="space-y-6">
        <RecordPaymentSuccessBanner
          title={`${summary.recorded_count} payment${summary.recorded_count === 1 ? "" : "s"} recorded`}
          description={`Total collected: ${formatUGX(summary.total_amount)}${
            summary.failed_count > 0 ? ` · ${summary.failed_count} failed` : ""
          }`}
        >
          <ul className="space-y-2">
            {recorded.map((item) => (
              <li
                key={item.payment.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-theme bg-theme-surface px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-theme-primary">{item.payment.student_name}</p>
                  <p className="text-xs text-theme-muted">
                    {item.payment.receipt_number} · {formatUGX(item.payment.amount)}
                  </p>
                </div>
                <PdfDownloadButton
                  path={`/schools/fees/receipts/${item.payment.id}`}
                  label="PDF"
                  className="ms-btn-secondary text-xs"
                />
              </li>
            ))}
          </ul>
          {failed.length > 0 ? (
            <div className="rounded-xl border border-theme-danger/30 bg-theme-danger/5 p-4 text-sm text-theme-danger">
              {failed.map((item) => (
                <p key={`${item.student_id}-${item.index}`}>{item.error}</p>
              ))}
            </div>
          ) : null}
          <button type="button" className="ms-btn-primary w-full sm:w-auto" onClick={resetAfterSuccess}>
            Record more payments
          </button>
        </RecordPaymentSuccessBanner>
      </section>
    );
  }

  return (
    <FeesPageShell
      title="Record payment"
      description={
        payInvoice
          ? `Paying invoice ${payInvoice.invoice_number} — select fee categories below (max ${formatUGX(payInvoice.balance)})`
          : "Search students, record single or bulk fee payments, and generate receipts."
      }
    >
      <QueryState
        error={listError}
        isLoading={isLoading && !data}
        data={data}
        onRetry={() => void mutate()}
        loading={<Skeleton className="h-72 rounded-2xl" />}
        isEmpty={() => false}
      >
        {(payload) => (
          <FeesStatStrip
            items={[
              { label: "Outstanding students", value: payload.summary.total_students },
              {
                label: "Total outstanding",
                value: formatUGX(payload.summary.total_outstanding),
                tone: payload.summary.total_outstanding > 0 ? "danger" : "default",
              },
              {
                label: "Unpaid / partial",
                value: `${payload.summary.unpaid_count} / ${payload.summary.partial_count}`,
              },
            ]}
          />
        )}
      </QueryState>

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-4 xl:col-span-3">
          <DataListPanel
            toolbar={
              <ListToolbar
                searchValue={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search by name or learner ID…"
                actions={
                  selectedAccountIds.size > 0 ? (
                    <button
                      type="button"
                      className="ms-btn-primary text-sm"
                      onClick={() => setBulkOpen(true)}
                    >
                      Record bulk ({selectedAccountIds.size})
                    </button>
                  ) : undefined
                }
                filters={
                  <>
                    <FilterField label="Class">
                      <select
                        className="ms-input w-full"
                        value={classId}
                        onChange={(e) => setClassId(e.target.value)}
                      >
                        <option value="">All classes</option>
                        {classes.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.level}
                            {item.stream ? ` ${item.stream}` : ""}
                          </option>
                        ))}
                      </select>
                    </FilterField>
                    <FilterField label="Status" className="sm:col-span-2 lg:col-span-1">
                      <FilterSegment
                        value={statusFilter}
                        onChange={setStatusFilter}
                        aria-label="Filter by fee status"
                        options={[
                          { value: "", label: "All" },
                          { value: "unpaid", label: "Unpaid" },
                          { value: "partial", label: "Partial" },
                        ]}
                      />
                    </FilterField>
                  </>
                }
              />
            }
            footer={
              <TablePagination
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
                noun="students"
              />
            }
          >
            {students.length === 0 ? (
              <EmptyState
                title="No students match your filters"
                description="Try a different search or clear filters to see outstanding balances."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="ms-table w-full min-w-[40rem]">
                  <thead>
                    <tr>
                      <th className="w-10">
                        <input
                          type="checkbox"
                          checked={
                            students.length > 0 &&
                            students.every((student) => selectedStudentsMap.has(student.account_id))
                          }
                          onChange={toggleSelectAll}
                          aria-label="Select all on this page"
                        />
                      </th>
                      <th>Student</th>
                      <th>Class</th>
                      <th>Term</th>
                      <th className="text-right">Balance</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => {
                      const isActive = activeStudent?.account_id === student.account_id;
                      return (
                        <tr
                          key={student.account_id}
                          className={isActive ? "bg-theme-accent-muted/40" : undefined}
                        >
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedAccountIds.has(student.account_id)}
                              onChange={() => toggleSelect(student)}
                              aria-label={`Select ${student.full_name}`}
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="text-left"
                              onClick={() => selectStudent(student)}
                            >
                              <div className="font-medium text-theme-primary hover:text-theme-accent">
                                {student.full_name}
                              </div>
                              <div className="text-xs text-theme-muted">{student.learner_id}</div>
                            </button>
                          </td>
                          <td>{student.class_name}</td>
                          <td className="whitespace-nowrap text-sm text-theme-muted">
                            {student.term_name} {student.academic_year}
                          </td>
                          <td className="text-right font-semibold tabular-nums text-theme-danger">
                            {formatUGX(student.balance)}
                          </td>
                          <td>
                            <FeeStatusBadge status={student.status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </DataListPanel>
        </div>

        <div className="xl:col-span-2">
          <div className="sticky top-4 space-y-4 rounded-2xl border border-theme bg-theme-surface p-5">
            {activeStudent ? (
              <>
                <div className="flex items-start gap-3 border-b border-theme pb-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-theme-accent-muted text-theme-accent">
                    <Receipt className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-theme-primary">{activeStudent.full_name}</p>
                    <p className="text-xs text-theme-muted">
                      {activeStudent.learner_id} · {activeStudent.class_name}
                    </p>
                    <p className="mt-1 text-sm text-theme-muted">
                      {activeStudent.term_name} {activeStudent.academic_year}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <FeeStatusBadge status={activeStudent.status} />
                      <span className="text-sm font-semibold text-theme-danger">
                        {formatUGX(activeStudent.balance)}
                      </span>
                    </div>
                  </div>
                </div>

                {accounts.length > 1 ? (
                  <label className="block">
                    <span className="mb-1 block text-xs text-theme-muted">Fee account</span>
                    <select
                      className="ms-input w-full"
                      value={activeAccount?.id ?? ""}
                      onChange={(e) => {
                        const account = accounts.find((item) => item.id === e.target.value);
                        if (!account || !activeStudent) return;
                        setActiveStudent({
                          ...activeStudent,
                          fee_structure_id: account.fee_structure_id,
                          balance: account.balance,
                          status: account.status,
                          term_name: account.term_name,
                          academic_year: account.academic_year,
                        });
                        setAmount(account.balance);
                      }}
                    >
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.term_name} {account.academic_year} — {formatUGX(account.balance)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <form onSubmit={(e) => void submitSingle(e)} className="space-y-4">
                  {useItemAllocations ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-theme-muted">Fee categories</span>
                        <button
                          type="button"
                          className="text-xs font-medium text-theme-accent hover:underline"
                          onClick={() =>
                            setDrafts((prev) =>
                              prev.map((row) => ({
                                ...row,
                                selected: true,
                                amount: row.balance,
                              })),
                            )
                          }
                        >
                          Pay all outstanding
                        </button>
                      </div>
                      {payInvoice ? (
                        <p className="text-xs text-theme-muted">
                          Invoice {payInvoice.invoice_number} · outstanding{" "}
                          {formatUGX(payInvoice.balance)}
                        </p>
                      ) : null}
                      {drafts.map((row) => (
                        <div
                          key={row.invoice_item_id || row.description}
                          className="rounded-lg border border-theme p-3"
                        >
                          <label className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={row.selected}
                              onChange={(e) =>
                                updateDraft(row.invoice_item_id, {
                                  selected: e.target.checked,
                                  amount: e.target.checked ? row.balance : 0,
                                })
                              }
                            />
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <span className="text-sm font-medium text-theme-primary">
                                  {row.description}
                                </span>
                                <span className="text-xs text-theme-muted">
                                  {formatUGX(row.balance)} due
                                </span>
                              </div>
                              {row.selected ? (
                                <div className="flex overflow-hidden rounded-xl border border-theme">
                                  <span className="flex items-center bg-theme-surface-raised px-3 text-sm text-theme-muted">
                                    UGX
                                  </span>
                                  <input
                                    className="ms-input w-full border-0"
                                    value={formatUGXInput(row.amount)}
                                    onChange={(e) =>
                                      updateDraft(row.invoice_item_id, {
                                        amount: Math.min(
                                          parseUGXInput(e.target.value),
                                          row.balance,
                                        ),
                                      })
                                    }
                                  />
                                </div>
                              ) : null}
                            </div>
                          </label>
                        </div>
                      ))}
                      <p className="text-right text-sm font-semibold text-theme-primary">
                        Total: {formatUGX(allocationTotal)}
                      </p>
                    </div>
                  ) : (
                    <label className="block">
                      <span className="mb-1 block text-xs text-theme-muted">Amount (UGX)</span>
                      <input
                        className="ms-input w-full"
                        value={formatUGXInput(amount)}
                        onChange={(e) => setAmount(parseUGXInput(e.target.value))}
                      />
                      <button
                        type="button"
                        className="mt-1 text-xs font-medium text-theme-accent hover:underline"
                        onClick={() => setAmount(maxAmount)}
                      >
                        Use full balance ({formatUGX(maxAmount)})
                      </button>
                    </label>
                  )}

                  <fieldset className="space-y-2">
                    <legend className="text-xs text-theme-muted">Payment method</legend>
                    <div className="flex flex-wrap gap-2">
                      {(["cash", "bank_transfer", "mobile_money", "cheque", "other"] as const).map(
                        (value) => (
                          <label
                            key={value}
                            className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                              method === value
                                ? "border-theme-accent bg-theme-accent-muted text-theme-accent"
                                : "border-theme text-theme-muted"
                            }`}
                          >
                            <input
                              type="radio"
                              className="sr-only"
                              checked={method === value}
                              onChange={() => setMethod(value)}
                            />
                            {paymentMethodLabel(value)}
                          </label>
                        ),
                      )}
                    </div>
                  </fieldset>

                  {method !== "cash" ? (
                    <label className="block">
                      <span className="mb-1 block text-xs text-theme-muted">Reference</span>
                      <input
                        className="ms-input w-full"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                      />
                    </label>
                  ) : null}

                  <label className="block">
                    <span className="mb-1 block text-xs text-theme-muted">Payment date</span>
                    <input
                      type="date"
                      className="ms-input w-full"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs text-theme-muted">Notes</span>
                    <textarea
                      className="ms-input w-full"
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </label>

                  {error ? <p className="text-sm text-theme-danger">{error}</p> : null}

                  <LoadingButton type="submit" className="ms-btn-primary w-full" loading={loading}>
                    Record payment & generate receipt
                  </LoadingButton>
                </form>
              </>
            ) : (
              <div className="py-8 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-theme-faint" />
                <p className="mt-3 text-sm font-medium text-theme-primary">Select a student</p>
                <p className="mt-1 text-sm text-theme-muted">
                  Click a row in the table or select multiple for bulk recording.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {bulkOpen ? (
        <BulkRecordPaymentPanel
          students={selectedStudents}
          onClose={() => setBulkOpen(false)}
          onSuccess={(result) => {
            setBulkOpen(false);
            setSuccess({ mode: "bulk", result });
            toast.success(
              `${result.summary.recorded_count} payment${result.summary.recorded_count === 1 ? "" : "s"} recorded — ${formatUGX(result.summary.total_amount)}`,
            );
            void mutate();
          }}
        />
      ) : null}
    </FeesPageShell>
  );
}
