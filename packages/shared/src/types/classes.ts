export interface Subject {
  id: string;
  name: string;
  created_at?: string;
}

export interface ClassRecord {
  id: string;
  school_id?: string;
  level: string;
  stream: string | null;
  capacity: number | null;
  created_at?: string;
}

export interface ClassWithDetails extends ClassRecord {
  student_count: number;
  subjects: Array<Pick<Subject, "id" | "name">>;
}
