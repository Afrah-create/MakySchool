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
import { PageHeader } from "@makyschool/ui/components/ui/PageHeader";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { TablePagination } from "@makyschool/ui/components/ui/TablePagination";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useApiSWR } from "@/hooks/useApiSWR";
import { apiClient } from "@/lib/api/client";
import { formatUGX, formatUGXInput, parseUGXInput } from "@/lib/formatCurrency";
import type {
  BulkRecordPaymentResult,
  InvoiceDetail,
  OutstandingStudent,
  PaymentMethod,
  RecordPaymentResult,
  StudentFeeAccount,
} from "@/lib/fees/types";
import { paymentMethodLabel } from "@/lib/fees/types";
import type { ClassOption } from "@/lib/students/types";
import { useToast } from "@/providers/ToastProvider";

const PAGE_SIZE = 20;

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

export function RecordPaymentContent() {
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [classId, setClassId] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "unpaid" | "partial">("");
  const [page, setPage] = useState(1);
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

  const invoiceId = searchParams.get("invoice_id");
  const preselectedStudentId = searchParams.get("student_id");

  const listQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(PAGE_SIZE));
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (classId) params.set("class_id", classId);
    if (statusFilter) params.set("status", statusFilter);
    return `/schools/fees/outstanding?${params.toString()}`;
  }, [page, debouncedSearch, classId, statusFilter]);

  const { data, error: listError, isLoading, mutate } = useApiSWR<OutstandingResponse>(listQuery);
  const { data: classes = [] } = useApiSWR<ClassOption[]>("/schools/classes");
  const { data: invoiceData } = useApiSWR<InvoiceDetail>(
    invoiceId ? `/schools/fees/invoices/${invoiceId}` : null,
  );

  const students = data?.students ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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

  const maxAmount = invoiceData?.balance ?? activeAccount?.balance ?? activeStudent?.balance ?? 0;

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
      fee_structure_id: "",
      amount_owed: invoiceData.total_amount,
      amount_paid: invoiceData.amount_paid,
      balance: invoiceData.balance,
      status: invoiceData.status as OutstandingStudent["status"],
      term_name: invoiceData.term_name,
      academic_year: invoiceData.academic_year,
    });
    setAmount(invoiceData.balance);
  }, [invoiceData]);

  useEffect(() => {
    if (!activeStudent || invoiceData) return;
    setAmount(activeStudent.balance);
  }, [activeStudent?.account_id, activeStudent?.balance, invoiceData]);

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

  async function submitSingle(event: React.FormEvent) {
    event.preventDefault();
    if (!activeStudent) return;

    const feeStructureId = activeAccount?.fee_structure_id ?? activeStudent.fee_structure_id;
    if (!feeStructureId?.trim()) {
      setError("Fee structure is missing for this student. Refresh the page and try again.");
      return;
    }
    if (amount <= 0 || amount > maxAmount) {
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
          amount,
          payment_method: method,
          payment_reference: reference.trim() || undefined,
          payment_date: paymentDate,
          notes: notes.trim() || undefined,
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
    const { payment, account } = success.result;
    const paidInFull = account.balance <= 0;
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
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  paidInFull ? "bg-theme-success-text/15 text-theme-success-text" : "badge-warning"
                }`}
              >
                {paidInFull ? "Paid in full" : `Balance ${formatUGX(account.balance)}`}
              </span>
            </div>
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
    <section className="space-y-6">
      <PageHeader
        title="Record payment"
        description={
          invoiceData
            ? `Paying invoice ${invoiceData.invoice_number} — max ${formatUGX(invoiceData.balance)}`
            : "Search students, record single or bulk fee payments, and generate receipts."
        }
      />

      <QueryState
        error={listError}
        isLoading={isLoading && !data}
        data={data}
        onRetry={() => void mutate()}
        loading={<Skeleton className="h-72 rounded-xl" />}
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
              total > 0 ? (
                <TablePagination
                  summary={`Page ${page} of ${totalPages} · ${total} student${total === 1 ? "" : "s"}`}
                  onPrevious={() => setPage((current) => Math.max(1, current - 1))}
                  onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
                  previousDisabled={page <= 1}
                  nextDisabled={page >= totalPages}
                />
              ) : undefined
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
    </section>
  );
}
