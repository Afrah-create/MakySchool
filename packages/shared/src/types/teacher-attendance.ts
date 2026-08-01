/** Teacher GPS attendance types */

export type TeacherAttendanceStatus =
  | "present"
  | "late"
  | "outside_fence"
  | "absent"
  | "partial"
  | "not_yet_arrived";

export interface TeacherAttendanceSchoolLocation {
  latitude: number | null;
  longitude: number | null;
  radius_metres: number;
  is_configured: boolean;
  name?: string | null;
}

export interface TeacherAttendanceSettings {
  clock_in_deadline: string;
  auto_absent_after: string;
  enforce_geofence: boolean;
  allow_outside_fence: boolean;
  notify_admin_on_late: boolean;
}

export interface TeacherAttendanceSettingsResponse {
  school_location: TeacherAttendanceSchoolLocation;
  settings: TeacherAttendanceSettings;
}

export interface TeacherAttendanceSettingsPatch {
  latitude?: number;
  longitude?: number;
  radius_metres?: number;
  clock_in_deadline?: string;
  auto_absent_after?: string;
  enforce_geofence?: boolean;
  allow_outside_fence?: boolean;
  notify_admin_on_late?: boolean;
}

export interface TeacherClockCoords {
  latitude: number;
  longitude: number;
  accuracy_metres: number;
}

export interface TeacherClockInResult {
  message: string;
  status: TeacherAttendanceStatus;
  clock_in_at: string;
  distance_metres: number | null;
  within_fence: boolean | null;
  is_late: boolean;
}

export interface TeacherClockOutResult {
  message: string;
  clock_out_at: string;
  duration_minutes: number;
  distance_metres: number | null;
}

export interface TeacherMyStatusToday {
  date: string;
  status: TeacherAttendanceStatus;
  clock_in_at: string | null;
  clock_out_at: string | null;
  duration_minutes: number | null;
  clock_in_distance_metres: number | null;
  is_clocked_in: boolean;
  is_clocked_out: boolean;
}

export interface TeacherMyStatusResponse {
  today: TeacherMyStatusToday | null;
  this_week: { present: number; late: number; absent: number };
  this_month: {
    present: number;
    late: number;
    absent: number;
    attendance_percent: number;
  };
  school_location: TeacherAttendanceSchoolLocation;
  settings: {
    clock_in_deadline: string;
    enforce_geofence: boolean;
    allow_outside_fence: boolean;
  };
  recent: Array<{
    date: string;
    status: TeacherAttendanceStatus;
    clock_in_at: string | null;
    clock_out_at: string | null;
    duration_minutes: number | null;
  }>;
}

export interface TeacherTodayRow {
  teacher_id: string;
  full_name: string;
  email: string | null;
  photo_url: string | null;
  status: TeacherAttendanceStatus;
  clock_in_at: string | null;
  clock_out_at: string | null;
  clock_in_distance_metres: number | null;
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  duration_minutes: number | null;
  is_manual: boolean;
  manual_reason?: string | null;
}

export interface TeacherTodayResponse {
  date: string;
  summary: {
    total_teachers: number;
    present: number;
    late: number;
    absent: number;
    outside_fence: number;
    not_yet_arrived: number;
    attendance_rate: number;
  };
  teachers: TeacherTodayRow[];
}

export interface TeacherAttendanceHistoryRecord {
  id: string;
  teacher_id: string;
  full_name: string;
  email: string | null;
  date: string;
  status: TeacherAttendanceStatus;
  clock_in_at: string | null;
  clock_out_at: string | null;
  duration_minutes: number | null;
  clock_in_distance_metres: number | null;
  is_manual: boolean;
  manual_reason: string | null;
}

export interface TeacherAttendanceHistoryResponse {
  page: number;
  limit: number;
  total: number;
  summary: Record<string, number>;
  records: TeacherAttendanceHistoryRecord[];
}

export interface TeacherAttendanceDetailResponse {
  teacher: {
    id: string;
    full_name: string;
    email: string | null;
    photo_url: string | null;
    role: string;
    subject_specialization: string | null;
    classes: string[];
  };
  month_summary: {
    month: string;
    month_key: string;
    working_days: number;
    present: number;
    late: number;
    absent: number;
    outside_fence: number;
    attendance_percent: number;
    average_clock_in: string | null;
    average_duration_minutes: number | null;
  };
  records: Array<{
    date: string;
    status: TeacherAttendanceStatus;
    clock_in_at: string | null;
    clock_out_at: string | null;
    duration_minutes: number | null;
    clock_in_distance_metres: number | null;
    is_manual: boolean;
    manual_reason: string | null;
  }>;
}

export interface TeacherMapPin {
  teacher_id: string;
  full_name: string;
  initials: string;
  status: TeacherAttendanceStatus;
  clock_in_at: string | null;
  clock_out_at: string | null;
  latitude: number;
  longitude: number;
  distance_metres: number | null;
  within_fence: boolean | null;
}

export interface TeacherMapDataResponse {
  date: string;
  school_location: TeacherAttendanceSchoolLocation & { name?: string | null };
  pins: TeacherMapPin[];
  absent_teachers: Array<{ teacher_id: string; full_name: string }>;
  updated_at: string;
}

export interface ManualMarkPayload {
  teacher_id: string;
  date: string;
  status: "present" | "late" | "absent";
  reason: string;
  clock_in_time?: string | null;
  clock_out_time?: string | null;
}
