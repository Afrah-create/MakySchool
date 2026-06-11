export interface SubscriptionPayment {
  id: string;
  school_id?: string;
  amount: number;
  term: string;
  year: number;
  schoolpay_ref: string | null;
  paid_at: string;
}
