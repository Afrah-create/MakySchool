import type { MakySchoolRole } from "@makyschool/shared/types";

export type FeeAccountStatus = "unpaid" | "partial" | "paid" | "waived" | "overpaid";

export type PaymentMethod = "cash" | "bank_transfer" | "mobile_money" | "cheque" | "other";

export type FeeStructure = {
  id: string;
  class_id: string;
  class_name: string;
  term_name: string;
  academic_year: number;
  amount: number;
  description?: string | null;
  is_active: boolean;
  student_count: number;
  total_owed: number;
  total_collected: number;
  total_outstanding: number;
};

export type FeePayment = {
  id: string;
  receipt_number: string;
  amount: number;
  payment_method: PaymentMethod;
  payment_date: string;
  voided: boolean;
  student_name: string;
  learner_id?: string;
  class_name?: string;
  term_name?: string;
  recorded_by_name?: string | null;
};

export type StudentFeeAccount = {
  id: string;
  fee_structure_id: string;
  term_name: string;
  academic_year: number;
  class_name: string;
  amount_owed: number;
  amount_paid: number;
  balance: number;
  status: FeeAccountStatus;
  payments: Array<{
    id: string;
    receipt_number: string;
    amount: number;
    payment_date: string;
    payment_method: PaymentMethod;
    voided: boolean;
  }>;
};

export type OutstandingStudent = {
  student_id: string;
  full_name: string;
  learner_id: string;
  class_name: string;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  account_id: string;
  fee_structure_id: string;
  amount_owed: number;
  amount_paid: number;
  balance: number;
  status: FeeAccountStatus;
  term_name: string;
  academic_year: number;
};

export type RecordPaymentResult = {
  payment: {
    id: string;
    receipt_number: string;
    amount: number;
    student_name: string;
    learner_id?: string;
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

export type BulkRecordPaymentResult = {
  recorded: RecordPaymentResult[];
  failed: Array<{ index: number; student_id: string; error: string }>;
  summary: {
    recorded_count: number;
    failed_count: number;
    total_amount: number;
  };
};

export type FeesDashboardStats = {
  total_collected: number;
  total_outstanding: number;
  students_fully_paid: number;
  students_with_balance: number;
};

export function feesBasePath(role: MakySchoolRole) {
  return role === "bursar" ? "/bursar" : "/dashboard/fees";
}

export function paymentMethodLabel(method: PaymentMethod | string) {
  switch (method) {
    case "bank_transfer":
      return "Bank Transfer";
    case "mobile_money":
      return "Mobile Money";
    case "cheque":
      return "Cheque";
    case "other":
      return "Other";
    default:
      return "Cash";
  }
}

export function feeStatusBadgeClass(status: FeeAccountStatus | string) {
  switch (status) {
    case "paid":
      return "badge-paid";
    case "partial":
      return "badge-partial";
    case "waived":
      return "badge-waived";
    case "unpaid":
      return "badge-unpaid";
    default:
      return "badge-info";
  }
}

export type ChartAccountType = "income" | "expense";

export type ChartAccount = {
  id: string;
  code: string;
  name: string;
  account_type: ChartAccountType;
  category?: string | null;
  description?: string | null;
  is_active: boolean;
};

export type IncomeSource = {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  is_active: boolean;
};

export type OtherIncomeItem = {
  id?: string;
  description: string;
  account_id?: string | null;
  account_name?: string | null;
  account_code?: string | null;
  amount: number;
};

export type OtherIncomeRecord = {
  id: string;
  reference_number: string;
  description: string;
  income_date: string;
  total_amount: number;
  payment_method: PaymentMethod;
  payment_reference?: string | null;
  notes?: string | null;
  voided: boolean;
  void_reason?: string | null;
  source_id?: string | null;
  source_name?: string | null;
  recorded_by_name?: string | null;
  item_count?: number;
  items?: OtherIncomeItem[];
};

export type OtherIncomeListResponse = {
  items: OtherIncomeRecord[];
  total: number;
  page: number;
  limit: number;
};

export type InvoiceStatus = "unpaid" | "partial" | "paid" | "cancelled" | "voided";

export type InvoiceItem = {
  id?: string;
  description: string;
  account_id?: string | null;
  account_name?: string | null;
  account_code?: string | null;
  quantity: number;
  unit_amount: number;
  total_amount: number;
};

export type InvoiceSummary = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date?: string | null;
  term_name: string;
  academic_year: number;
  status: InvoiceStatus;
  total_amount: number;
  amount_paid: number;
  balance: number;
  student_name: string;
  learner_id?: string;
  class_name?: string;
};

export type InvoiceDetail = InvoiceSummary & {
  student_id: string;
  fee_structure_id?: string | null;
  notes?: string | null;
  cancel_reason?: string | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  items: InvoiceItem[];
  payments: Array<{
    id: string;
    receipt_number: string;
    amount: number;
    payment_method: PaymentMethod;
    payment_date: string;
    voided: boolean;
  }>;
};

export type InvoiceListResponse = {
  invoices: InvoiceSummary[];
  total: number;
  page: number;
  limit: number;
};

export type InvoiceBulkResult = {
  created: number;
  failed: number;
  errors: Array<{ student_id: string; error: string }>;
};

export type BudgetType = "income" | "expense";

export type BudgetItem = {
  id: string;
  account_id?: string | null;
  account_code?: string | null;
  account_name?: string | null;
  term_name: string;
  academic_year: number;
  name: string;
  category?: string | null;
  budget_type: BudgetType;
  budgeted_amount: number;
  notes?: string | null;
};

export type BudgetReportItem = {
  id: string;
  name: string;
  category?: string | null;
  budget_type: BudgetType;
  account_id?: string | null;
  account_code?: string | null;
  budgeted_amount: number;
  actual_amount: number | null;
  variance: number | null;
  variance_percent: number | null;
  status: "on_track" | "under" | "over" | "coming_soon";
};

export type BudgetReport = {
  term_name: string;
  academic_year: number;
  summary: {
    total_budgeted_income: number;
    total_actual_income: number;
    total_budgeted_expense: number;
    total_actual_expense: number | null;
  };
  items: BudgetReportItem[];
};

export function invoiceStatusBadgeClass(status: InvoiceStatus | string) {
  switch (status) {
    case "paid":
      return "badge-paid";
    case "partial":
      return "badge-partial";
    case "unpaid":
      return "badge-unpaid";
    case "cancelled":
    case "voided":
      return "badge-waived";
    default:
      return "badge-info";
  }
}
