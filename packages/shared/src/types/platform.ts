export interface PlatformBillingSettings {
  subscription_fee_ugx: number;
  currency: "UGX";
  min_ugx: number;
  max_ugx: number;
  updated_at: string | null;
  updated_by: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
}

export interface SubscriptionAuditOverviewItem {
  school_id: string;
  name: string | null;
  slug: string;
  status: string;
  subscription_status: string;
  paid_term: string | null;
  paid_year: number | null;
  required_term: string;
  required_year: number;
  term_source: "calendar" | "heuristic";
  term_start: string | null;
  needs_payment: boolean;
  admin_email: string;
}

export interface SubscriptionAuditOverview {
  items: SubscriptionAuditOverviewItem[];
  summary: {
    total: number;
    needs_payment: number;
    active: number;
  };
}

export interface SuperAdminListItem {
  id: string;
  email: string;
  name: string;
  created_at: string;
}
