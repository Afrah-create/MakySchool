export type LearnerMe = {
  id: string;
  learner_id: string;
  full_name: string;
  date_of_birth: string | null;
  gender: string | null;
  photo_url: string | null;
  status: string;
  class_id: string | null;
  class_name: string | null;
  guardian: {
    id: string;
    full_name: string;
    phone: string | null;
    email: string | null;
    relationship: string;
  } | null;
  fees: {
    total_balance: number;
    total_paid: number;
    total_owed: number;
    account_count: number;
  };
};

export function learnerFirstName(fullName: string): string {
  const part = fullName.trim().split(/\s+/)[0];
  return part || fullName;
}
