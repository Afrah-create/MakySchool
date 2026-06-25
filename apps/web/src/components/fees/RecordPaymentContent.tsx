"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useApiSWR } from "@/hooks/useApiSWR";
import { apiClient } from "@/lib/api/client";
import { formatUGX, formatUGXInput, parseUGXInput } from "@/lib/formatCurrency";
import {
  FeeStatusBadge,
} from "@/components/fees/FeeStatusBadge";
import { PdfDownloadButton } from "@/components/fees/PdfDownloadButton";
import type { InvoiceDetail, PaymentMethod, StudentFeeAccount } from "@/lib/fees/types";
import { paymentMethodLabel } from "@/lib/fees/types";
import { useToast } from "@/providers/ToastProvider";

type StudentOption = {
  id: string;
  full_name: string;
  learner_id: string;
  class_name?: string;
};

type RecordPaymentResponse = {
  payment: {
    id: string;
    receipt_number: string;
    amount: number;
    student_name: string;
    class_name: string;
    term_name: string;
    payment_method: PaymentMethod;
    payment_date: string;
  };
  account: {
    amount_owed: number;
    amount_paid: number;
    balance: number;
    status: string;
  };
};

export function RecordPaymentContent() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<RecordPaymentResponse | null>(null);

  const studentQuery = useMemo(() => {
    if (!debouncedSearch.trim()) return null;
    return `/schools/students?search=${encodeURIComponent(debouncedSearch.trim())}&limit=8`;
  }, [debouncedSearch]);

  const { data: searchResults } = useApiSWR<{ students: StudentOption[] }>(studentQuery);
  const accountsQuery = selectedStudent ? `/schools/fees/accounts/student/${selectedStudent.id}` : null;
  const { data: accountsData } = useApiSWR<{ accounts: StudentFeeAccount[] }>(accountsQuery);

  const accounts = accountsData?.accounts ?? [];
  const selectedAccount = accounts.find((item) => item.id === selectedAccountId) ?? accounts[0];

  const invoiceId = searchParams.get("invoice_id");
  const { data: invoiceData } = useApiSWR<InvoiceDetail>(
    invoiceId ? `/schools/fees/invoices/${invoiceId}` : null,
  );
  const maxAmount = invoiceData?.balance ?? selectedAccount?.balance ?? 0;

  useEffect(() => {
    const studentId = searchParams.get("student_id");
    if (!studentId) return;
    void apiClient<StudentOption>(`/schools/students/${studentId}`).then((response) => {
      const student = response.data as StudentOption & { class_name?: string };
      setSelectedStudent({
        id: student.id,
        full_name: student.full_name,
        learner_id: student.learner_id,
        class_name: student.class_name,
      });
    }).catch(() => undefined);
  }, [searchParams]);

  useEffect(() => {
    if (!invoiceData) return;
    setSelectedStudent({
      id: invoiceData.student_id,
      full_name: invoiceData.student_name,
      learner_id: invoiceData.learner_id ?? "",
      class_name: invoiceData.class_name,
    });
  }, [invoiceData]);

  useEffect(() => {
    if (!invoiceData || accounts.length === 0) return;
    const match = accounts.find(
      (account) =>
        account.term_name === invoiceData.term_name && account.academic_year === invoiceData.academic_year,
    );
    if (match) {
      setSelectedAccountId(match.id);
    }
    setAmount(invoiceData.balance);
  }, [invoiceData, accounts]);

  useEffect(() => {
    if (!selectedAccount || invoiceData) return;
    setSelectedAccountId(selectedAccount.id);
    setAmount(selectedAccount.balance);
  }, [selectedAccount?.id, selectedAccount?.balance, invoiceData]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedStudent || !selectedAccount) return;
    if (amount <= 0 || amount > maxAmount) {
      setError(`Enter an amount up to ${formatUGX(maxAmount)}.`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient<RecordPaymentResponse>("/schools/fees/payments", {
        method: "POST",
        body: {
          student_id: selectedStudent.id,
          fee_structure_id: selectedAccount.fee_structure_id,
          amount,
          payment_method: method,
          payment_reference: reference.trim() || undefined,
          payment_date: paymentDate,
          notes: notes.trim() || undefined,
        },
      });
      setSuccess(response.data);
      toast.success(
        `Payment of ${formatUGX(response.data.payment.amount)} recorded for ${response.data.payment.student_name}. Balance: ${formatUGX(response.data.account.balance)}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    const paidInFull = success.account.balance <= 0;
    return (
      <section className="mx-auto max-w-2xl space-y-6">
        <div className={`rounded-xl border p-6 ${paidInFull ? "border-theme bg-theme-success-bg" : "border-theme bg-theme-surface"}`}>
          <p className="text-sm text-theme-muted">Receipt number</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-theme-primary">{success.payment.receipt_number}</p>
          <p className="mt-4 text-sm text-theme-muted">
            {paidInFull ? "PAID IN FULL" : `Balance: ${formatUGX(success.account.balance)}`}
          </p>
        </div>
        <div className="flex gap-2">
          <PdfDownloadButton
            path={`/schools/fees/receipts/${success.payment.id}`}
            label="Download receipt PDF"
            className="ms-btn-primary flex-1 text-center"
          />
          <button
            type="button"
            className="ms-btn-secondary flex-1"
            onClick={() => {
              setSuccess(null);
              setSelectedStudent(null);
              setSearch("");
            }}
          >
            Record another payment
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-theme-primary">Record payment</h1>
        <p className="mt-1 text-sm text-theme-muted">
          {invoiceData
            ? `Paying invoice ${invoiceData.invoice_number} — max ${formatUGX(invoiceData.balance)}`
            : "Search for a student and record their fee payment"}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-theme bg-theme-surface p-5">
          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Search student</span>
            <input
              className="ms-input w-full"
              placeholder="Name or learner ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          {!selectedStudent && (searchResults?.students.length ?? 0) > 0 ? (
            <ul className="divide-y divide-theme rounded-lg border border-theme">
              {searchResults!.students.map((student) => (
                <li key={student.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-nav-hover"
                    onClick={() => {
                      setSelectedStudent(student);
                      setSearch(student.full_name);
                    }}
                  >
                    <span>{student.full_name}</span>
                    <span className="text-theme-muted">{student.learner_id}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {selectedStudent ? (
            <div className="rounded-lg border border-theme bg-theme-surface-raised p-4">
              <p className="font-medium text-theme-primary">{selectedStudent.full_name}</p>
              <p className="text-sm text-theme-muted">{selectedStudent.learner_id}</p>
              {selectedStudent.class_name ? (
                <p className="text-sm text-theme-muted">{selectedStudent.class_name}</p>
              ) : null}
            </div>
          ) : null}

          {accounts.length > 0 ? (
            <label className="block">
              <span className="mb-1 block text-xs text-theme-muted">Fee account</span>
              <select
                className="ms-input w-full"
                value={selectedAccount?.id ?? ""}
                onChange={(e) => setSelectedAccountId(e.target.value)}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.term_name} {account.academic_year} — {formatUGX(account.balance)} outstanding
                  </option>
                ))}
              </select>
            </label>
          ) : selectedStudent ? (
            <p className="text-sm text-theme-muted">No fee accounts for this student yet.</p>
          ) : null}

          {selectedAccount ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-theme-muted">Status</span>
                <FeeStatusBadge status={selectedAccount.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-theme-muted">Balance</span>
                <span className={selectedAccount.balance > 0 ? "font-semibold text-theme-danger" : "font-semibold text-theme-success-text"}>
                  {selectedAccount.balance > 0 ? formatUGX(selectedAccount.balance) : "Paid"}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <form onSubmit={(e) => void submit(e)} className="space-y-4 rounded-xl border border-theme bg-theme-surface p-5">
          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Amount (UGX)</span>
            <input
              className="ms-input w-full"
              value={formatUGXInput(amount)}
              onChange={(e) => setAmount(parseUGXInput(e.target.value))}
              disabled={!selectedAccount}
            />
          </label>

          <fieldset className="space-y-2">
            <legend className="text-xs text-theme-muted">Payment method</legend>
            {(["cash", "bank_transfer", "mobile_money", "cheque", "other"] as const).map((value) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input type="radio" checked={method === value} onChange={() => setMethod(value)} />
                {paymentMethodLabel(value)}
              </label>
            ))}
          </fieldset>

          {method !== "cash" ? (
            <label className="block">
              <span className="mb-1 block text-xs text-theme-muted">
                {method === "bank_transfer"
                  ? "Bank reference / transaction ID"
                  : method === "mobile_money"
                    ? "Mobile money transaction ID"
                    : method === "cheque"
                      ? "Cheque number"
                      : "Reference"}
              </span>
              <input className="ms-input w-full" value={reference} onChange={(e) => setReference(e.target.value)} />
            </label>
          ) : null}

          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Payment date</span>
            <input type="date" className="ms-input w-full" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-theme-muted">Notes</span>
            <textarea className="ms-input w-full" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          {error ? <p className="text-sm text-theme-danger">{error}</p> : null}

          <button type="submit" className="ms-btn-primary w-full" disabled={loading || !selectedAccount}>
            {loading ? "Recording…" : "Record payment & generate receipt"}
          </button>
        </form>
      </div>
    </section>
  );
}
