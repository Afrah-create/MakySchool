export type TeachingPlanStatus = "pending" | "active" | "deleted";

export type SubjectResourceType = "pdf" | "video" | "document" | "other";

export type SubjectResourceStatus = "pending" | "active" | "deleted";

export interface TeachingPlan {
  id: string;
  schoolId: string;
  teacherId: string;
  teacherName?: string | null;
  classId: string;
  className?: string | null;
  subjectId: string;
  subjectName?: string | null;
  termId: string;
  termName?: string | null;
  title: string;
  description?: string | null;
  fileName: string;
  fileSize: number;
  fileType: string;
  status: TeachingPlanStatus;
  uploadedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface SubjectResource {
  id: string;
  schoolId: string;
  teacherId: string;
  teacherName?: string | null;
  classId: string;
  className?: string | null;
  subjectId: string;
  subjectName?: string | null;
  termId?: string | null;
  termName?: string | null;
  title: string;
  description?: string | null;
  resourceType: SubjectResourceType;
  fileName: string;
  fileSize: number;
  fileType: string;
  isPublished: boolean;
  status: SubjectResourceStatus;
  sortOrder: number;
  publishedAt?: string | null;
  uploadedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PresignedUploadResponse {
  resourceId: string;
  method: string;
  url: string;
  key: string;
  headers: Record<string, string>;
  expiresIn: number;
  replacesExisting?: boolean;
}

export interface PresignedDownloadResponse {
  url: string;
  expiresIn: number;
  fileName: string;
  resourceType?: SubjectResourceType;
}

export interface TeachingPlanCompliance {
  termId: string;
  termName: string;
  totalTeachers: number;
  uploadedCount: number;
  missingTeachers: Array<{ id: string; fullName: string }>;
}

export interface TeachingPlanUploadPayload {
  classId: string;
  subjectId: string;
  termId: string;
  title: string;
  description?: string | null;
  filename: string;
  fileSize: number;
  fileType: string;
}

export interface SubjectResourceUploadPayload {
  classId: string;
  subjectId: string;
  termId?: string | null;
  title: string;
  description?: string | null;
  filename: string;
  fileSize: number;
  fileType: string;
}
