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

export interface SuperAdminListItem {
  id: string;
  email: string;
  name: string;
  created_at: string;
}
