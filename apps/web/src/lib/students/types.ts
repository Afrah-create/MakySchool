export type StudentListItem = {
  id: string;
  learner_id: string;
  full_name: string;
  date_of_birth: string | null;
  gender: string | null;
  photo_url: string | null;
  status: string;
  created_at: string;
  class_id: string | null;
  class_name: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
};

export type StudentGuardian = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  relationship: string;
  is_primary: boolean;
};

export type StudentClassHistory = {
  id: string;
  class_id: string;
  class_name: string;
  enrolled_at: string;
  left_at: string | null;
  reason: string | null;
};

export type StudentDetail = StudentListItem & {
  current_class_id: string | null;
  level?: string | null;
  stream?: string | null;
  withdrawal_reason: string | null;
  withdrawn_at: string | null;
  updated_at: string;
  created_by: string | null;
  created_by_name: string | null;
  user_id?: string | null;
  has_portal_access?: boolean;
  portal_must_change_password?: boolean;
  guardian: StudentGuardian | null;
  class_history: StudentClassHistory[];
  fee_history: unknown[];
  results: unknown[];
};

export type StudentsListResponse = {
  students: StudentListItem[];
  total: number;
  page: number;
  limit: number;
};

export type ClassOption = {
  id: string;
  level: string;
  stream: string | null;
};

import type { ImportRowError } from "@makyschool/shared/types";

export type CreateStudentResponse = {
  student: {
    id: string;
    learner_id: string;
    full_name: string;
    class_name: string | null;
    guardian_name: string;
    guardian_phone: string | null;
  };
  temp_password?: string | null;
};

export type {
  ImportPreviewResponse,
  ImportRowError,
  ImportPreviewDuplicate,
} from "@makyschool/shared/types";

export type ImportErrorResponse = {
  error: string;
  code: string;
  row_errors: ImportRowError[];
  summary: string;
};
