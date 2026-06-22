export type TeacherAssignment = {
  assignment_id?: string;
  class_id: string;
  subject_id?: string | null;
  class_name?: string;
  stream?: string | null;
  subject_name?: string | null;
};

export type TeacherAssignmentRow = {
  class_id: string;
  class_name: string;
  subject_ids: string[];
  subject_names: Record<string, string>;
};

export type TeacherListItem = {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  subject_specialization?: string | null;
  is_active: boolean;
  assignments: TeacherAssignment[];
  total_students: number;
  last_login?: string | null;
};

export type TeacherDetail = TeacherListItem & {
  role: "teacher";
  created_at: string;
  created_by?: string | null;
  created_by_name?: string | null;
  submission_status: Array<{
    class_name: string;
    status: string;
    submitted_at: string | null;
  }>;
};

export type TeachersListResponse = {
  teachers: TeacherListItem[];
  total: number;
  page: number;
  limit: number;
};

export type ClassOption = {
  id: string;
  level: string;
  stream: string | null;
};

export type SubjectOption = {
  id: string;
  name: string;
};
