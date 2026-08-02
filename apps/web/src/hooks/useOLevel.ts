"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { olevelApi } from "@/lib/api/olevel";

export const olevelKeys = {
  overview: ["olevel", "overview"] as const,
  curriculum: ["olevel", "curriculum"] as const,
  classes: ["olevel", "classes"] as const,
  terms: ["olevel", "terms"] as const,
  subjects: ["olevel", "subjects"] as const,
  curriculumSubjects: (id: string) => ["olevel", "curriculumSubjects", id] as const,
  sessions: (filters: {
    classId?: string;
    termId?: string;
    academicYearId?: string;
    status?: string;
  }) =>
    [
      "olevel",
      "sessions",
      filters.classId ?? "",
      filters.termId ?? "",
      filters.academicYearId ?? "",
      filters.status ?? "",
    ] as const,
  enrollments: (classId?: string, yearId?: string) =>
    ["olevel", "enrollments", classId ?? "", yearId ?? ""] as const,
  enrollmentSubjects: (id: string) => ["olevel", "enrollmentSubjects", id] as const,
  markGrid: (sessionId: string, subjectId: string) =>
    ["olevel", "marks", sessionId, subjectId] as const,
  classResults: (classId: string, termId: string, yearId: string) =>
    ["olevel", "results", classId, termId, yearId] as const,
  submissions: (sessionId: string) => ["olevel", "submissions", sessionId] as const,
  teacherAssignments: ["olevel", "teacherAssignments"] as const,
};

export function useOLevelOverview(enabled = true) {
  return useQuery({
    queryKey: olevelKeys.overview,
    queryFn: () => olevelApi.overview(),
    enabled,
    staleTime: 30_000,
  });
}

export function useOLevelCurriculum(enabled = true) {
  return useQuery({
    queryKey: olevelKeys.curriculum,
    queryFn: () => olevelApi.getCurriculum(),
    enabled,
    staleTime: 60_000,
  });
}

export function useOLevelClasses(enabled = true) {
  return useQuery({
    queryKey: olevelKeys.classes,
    queryFn: () => olevelApi.listClasses(),
    enabled,
    staleTime: 60_000,
  });
}

export function useOLevelTerms(enabled = true) {
  return useQuery({
    queryKey: olevelKeys.terms,
    queryFn: () => olevelApi.listTerms(),
    enabled,
    staleTime: 60_000,
  });
}

export function useOLevelSubjects(enabled = true) {
  return useQuery({
    queryKey: olevelKeys.subjects,
    queryFn: () => olevelApi.listSubjects({ isActive: true }),
    enabled,
    staleTime: 60_000,
  });
}

export function useOLevelCurriculumSubjects(curriculumId?: string, enabled = true) {
  return useQuery({
    queryKey: olevelKeys.curriculumSubjects(curriculumId ?? ""),
    queryFn: () => olevelApi.listCurriculumSubjects(curriculumId!),
    enabled: enabled && !!curriculumId,
    staleTime: 60_000,
  });
}

export function useOLevelExamSessions(
  filters: {
    classId?: string;
    termId?: string;
    academicYearId?: string;
    status?: string;
  } = {},
  enabled = true,
) {
  return useQuery({
    queryKey: olevelKeys.sessions(filters),
    queryFn: () => olevelApi.listExamSessions(filters),
    enabled,
    staleTime: 20_000,
    placeholderData: (prev) => prev,
  });
}

export function useOLevelEnrollments(
  classId?: string,
  academicYearId?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: olevelKeys.enrollments(classId, academicYearId),
    queryFn: () => olevelApi.listEnrollments({ classId, academicYearId }),
    enabled: enabled && !!academicYearId,
    staleTime: 20_000,
  });
}

export function useOLevelMarkGrid(
  examSessionId?: string,
  subjectId?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: olevelKeys.markGrid(examSessionId ?? "", subjectId ?? ""),
    queryFn: () => olevelApi.getMarkGrid(examSessionId!, subjectId!),
    enabled: enabled && !!examSessionId && !!subjectId,
    staleTime: 10_000,
  });
}

export function useOLevelClassResults(
  classId?: string,
  termId?: string,
  academicYearId?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: olevelKeys.classResults(classId ?? "", termId ?? "", academicYearId ?? ""),
    queryFn: () => olevelApi.classResults(classId!, termId!, academicYearId!),
    enabled: enabled && !!classId && !!termId && !!academicYearId,
    staleTime: 15_000,
  });
}

export function useTeacherOLevelAssignments(enabled = true) {
  return useQuery({
    queryKey: olevelKeys.teacherAssignments,
    queryFn: () => olevelApi.teacherAssignments(),
    enabled,
    staleTime: 20_000,
  });
}

export function useOLevelSubmissions(examSessionId?: string, enabled = true) {
  return useQuery({
    queryKey: olevelKeys.submissions(examSessionId ?? ""),
    queryFn: () => olevelApi.listSubmissions(examSessionId!),
    enabled: enabled && !!examSessionId,
  });
}

export function useSetupOLevelCurriculum() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: olevelApi.setupCurriculum,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["olevel"] });
    },
  });
}

export function useSaveOLevelMarks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: olevelApi.saveMarks,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["olevel", "marks"] }),
  });
}

export function useSubmitOLevelMarks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      examSessionId,
      subjectId,
    }: {
      examSessionId: string;
      subjectId: string;
    }) => olevelApi.submitMarks(examSessionId, subjectId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["olevel"] }),
  });
}

export function useGradeOLevelClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: olevelApi.gradeClass,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["olevel", "results"] }),
  });
}

export function useRankOLevelClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: olevelApi.rankings,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["olevel", "results"] }),
  });
}

export function useApproveOLevelResults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: olevelApi.approve,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["olevel", "results"] }),
  });
}
