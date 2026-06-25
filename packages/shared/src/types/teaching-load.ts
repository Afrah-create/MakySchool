export type TeachingLoadSlot = {
  class_id: string;
  class_name: string;
  stream: string | null;
  subject_id: string;
  subject_name: string;
  teacher_id: string | null;
  teacher_name: string | null;
};

export type TeachingLoadTeacher = {
  id: string;
  full_name: string;
  is_active: boolean;
  slot_count: number;
};

export type TeachingLoadStats = {
  total_slots: number;
  assigned: number;
  unassigned: number;
  teachers_without_load: number;
};

export type TeachingLoadMatrix = {
  slots: TeachingLoadSlot[];
  teachers: TeachingLoadTeacher[];
  stats: TeachingLoadStats;
  teachers_without_load: string[];
};

export type TeachingLoadSlotUpdate = {
  class_id: string;
  subject_id: string;
  teacher_id: string | null;
};

export type TeachingLoadAssignment = {
  class_id: string;
  subject_id: string;
};

export type AssignmentSyncPreview = {
  warnings: Array<{
    class_id: string;
    class_name: string;
    status: string;
    message: string;
  }>;
  blocks: Array<{
    class_id: string;
    class_name: string;
    status: string;
    reason: string;
  }>;
  to_add?: Array<{ class_id: string; subject_id: string | null }>;
  to_remove?: Array<{ id: string; class_id: string; subject_id: string | null }>;
};
