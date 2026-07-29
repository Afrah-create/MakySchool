import { apiClient } from "./client";
import { resolveClientApiUrl } from "./base-url";
import { CLIENT_APP_HEADER, TENANT_HEADERS } from "@makyschool/shared/constants";
import { readStoredSchoolSlug } from "@/lib/auth/session";
import type {
  PresignedDownloadResponse,
  PresignedUploadResponse,
  SubjectResource,
  SubjectResourceUploadPayload,
  TeachingPlan,
  TeachingPlanCompliance,
  TeachingPlanUploadPayload,
} from "@makyschool/shared";

export type TeachingPlanListParams = {
  classId?: string;
  termId?: string;
  teacherId?: string;
  subjectId?: string;
};

export type SubjectResourceListParams = {
  classId?: string;
  subjectId?: string;
  termId?: string;
};

function qs(params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) q.set(key, value);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** PUT file to a presigned URL (Wasabi) or local-upload bridge, with progress. */
export function putFileWithProgress(
  upload: Pick<PresignedUploadResponse, "url" | "method" | "headers">,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const isAbsolute =
      upload.url.startsWith("http://") || upload.url.startsWith("https://");
    const targetUrl = isAbsolute
      ? upload.url
      : resolveClientApiUrl(upload.url.replace(/^\/api/, "") || upload.url);

    xhr.open(upload.method || "PUT", targetUrl, true);

    const headers = upload.headers || {};
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }

    // Local bridge needs auth cookies + tenant headers
    if (!isAbsolute) {
      xhr.withCredentials = true;
      const slug =
        (typeof document !== "undefined" && document.body.dataset.schoolSlug) ||
        readStoredSchoolSlug() ||
        "";
      if (slug) {
        xhr.setRequestHeader(TENANT_HEADERS.SCHOOL_SLUG, slug);
      }
      xhr.setRequestHeader(CLIENT_APP_HEADER, "tenant");
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }
      reject(new Error(`Upload failed (${xhr.status}). Please try again.`));
    };

    xhr.onerror = () => {
      reject(new Error("Upload failed. Please check your connection and try again."));
    };

    xhr.send(file);
  });
}

export const resourcesApi = {
  listTerms() {
    return apiClient<
      Array<{
        id: string;
        name: string;
        startDate: string | null;
        endDate: string | null;
        isCurrent: boolean;
      }>
    >("/api/schools/resources/terms").then((r) => r.data);
  },

  // Teaching plans
  listTeachingPlans(params: TeachingPlanListParams = {}) {
    return apiClient<TeachingPlan[]>(
      `/api/schools/resources/teaching-plans${qs({
        class_id: params.classId,
        term_id: params.termId,
        teacher_id: params.teacherId,
        subject_id: params.subjectId,
      })}`,
    ).then((r) => r.data);
  },

  teachingPlanCompliance(termId: string) {
    return apiClient<TeachingPlanCompliance>(
      `/api/schools/resources/teaching-plans/compliance${qs({ term_id: termId })}`,
    ).then((r) => r.data);
  },

  requestTeachingPlanUpload(payload: TeachingPlanUploadPayload) {
    return apiClient<PresignedUploadResponse>(
      "/api/schools/resources/teaching-plans/upload-url",
      {
        method: "POST",
        body: {
          class_id: payload.classId,
          subject_id: payload.subjectId,
          term_id: payload.termId,
          title: payload.title,
          description: payload.description ?? null,
          filename: payload.filename,
          file_size: payload.fileSize,
          file_type: payload.fileType,
        },
      },
    ).then((r) => r.data);
  },

  confirmTeachingPlan(id: string) {
    return apiClient<TeachingPlan>(
      `/api/schools/resources/teaching-plans/${id}/confirm`,
      { method: "POST" },
    ).then((r) => r.data);
  },

  downloadTeachingPlan(id: string) {
    return apiClient<PresignedDownloadResponse>(
      `/api/schools/resources/teaching-plans/${id}/download-url`,
    ).then((r) => r.data);
  },

  patchTeachingPlan(id: string, body: { title?: string; description?: string | null }) {
    return apiClient<TeachingPlan>(`/api/schools/resources/teaching-plans/${id}`, {
      method: "PATCH",
      body: {
        title: body.title,
        description: body.description,
      },
    }).then((r) => r.data);
  },

  deleteTeachingPlan(id: string) {
    return apiClient<null>(`/api/schools/resources/teaching-plans/${id}`, {
      method: "DELETE",
    });
  },

  // Subject resources
  listSubjectResources(params: SubjectResourceListParams = {}) {
    return apiClient<SubjectResource[]>(
      `/api/schools/resources/subject-resources${qs({
        class_id: params.classId,
        subject_id: params.subjectId,
        term_id: params.termId,
      })}`,
    ).then((r) => r.data);
  },

  requestSubjectResourceUpload(payload: SubjectResourceUploadPayload) {
    return apiClient<PresignedUploadResponse>(
      "/api/schools/resources/subject-resources/upload-url",
      {
        method: "POST",
        body: {
          class_id: payload.classId,
          subject_id: payload.subjectId,
          term_id: payload.termId ?? null,
          title: payload.title,
          description: payload.description ?? null,
          filename: payload.filename,
          file_size: payload.fileSize,
          file_type: payload.fileType,
        },
      },
    ).then((r) => r.data);
  },

  confirmSubjectResource(id: string) {
    return apiClient<SubjectResource>(
      `/api/schools/resources/subject-resources/${id}/confirm`,
      { method: "POST" },
    ).then((r) => r.data);
  },

  downloadSubjectResource(id: string) {
    return apiClient<PresignedDownloadResponse>(
      `/api/schools/resources/subject-resources/${id}/download-url`,
    ).then((r) => r.data);
  },

  patchSubjectResource(
    id: string,
    body: { title?: string; description?: string | null; sortOrder?: number },
  ) {
    return apiClient<SubjectResource>(
      `/api/schools/resources/subject-resources/${id}`,
      {
        method: "PATCH",
        body: {
          title: body.title,
          description: body.description,
          sort_order: body.sortOrder,
        },
      },
    ).then((r) => r.data);
  },

  setVisibility(id: string, isPublished: boolean) {
    return apiClient<SubjectResource>(
      `/api/schools/resources/subject-resources/${id}/visibility`,
      {
        method: "PATCH",
        body: { is_published: isPublished },
      },
    ).then((r) => r.data);
  },

  reorder(resourceIds: string[]) {
    return apiClient<SubjectResource[]>(
      "/api/schools/resources/subject-resources/reorder",
      {
        method: "PUT",
        body: { resource_ids: resourceIds },
      },
    ).then((r) => r.data);
  },

  deleteSubjectResource(id: string) {
    return apiClient<null>(`/api/schools/resources/subject-resources/${id}`, {
      method: "DELETE",
    });
  },
};
