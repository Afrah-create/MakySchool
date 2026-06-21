export type PaymentStatus = "pending" | "completed" | "failed";

export interface SubscriptionPayment {
  id: string;
  school_id?: string;
  amount: number;
  term: string;
  year: number;
  schoolpay_ref: string | null;
  status?: PaymentStatus;
  payment_reference?: string | null;
  provider?: string | null;
  paid_at: string | null;
  created_at?: string;
}

export interface BillingQuote {
  amount: number;
  currency: "UGX";
  term: string;
  year: number;
  subscription_status: string;
  phone_hint: string | null;
  configured: boolean;
}

export interface CollectPaymentResult {
  reference: string;
  status: "processing";
  message: string;
  phone_number: string;
}

export interface PaymentStatusResult {
  reference: string;
  status: PaymentStatus | "processing";
  subscription_status: string;
}
