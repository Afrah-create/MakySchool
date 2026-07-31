"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreatePrimaryExamPayload,
  PrimaryExamFilters,
  UpdatePrimaryExamPayload,
  UpdatePrimaryExamTypePayload,
} from "@makyschool/shared";
import { primaryApi } from "@/lib/api/primary";

export const primaryKeys = {
  overview: (termId?: string) => ["primary", "overview", termId ?? ""] as const,
  setup: ["primary", "setup"] as const,
  classes: ["primary", "classes"] as const,
  subjects: (level?: string) => ["primary", "subjects", level ?? ""] as const,
  themes: (level?: string) => ["primary", "themes", level ?? ""] as const,
  roster: (classId: string) => ["primary", "roster", classId] as const,
  classResults: (classId: string, termId: string) =>
    ["primary", "results", classId, termId] as const,
  exams: (filters: PrimaryExamFilters = {}) =>
    [
      "primary",
      "exams",
      filters.classId ?? "",
      filters.termId ?? "",
      filters.status ?? "",
      filters.includeDeleted ? "1" : "0",
    ] as const,
  examTypes: ["primary", "exam-types"] as const,
  thematic: (classId: string, termId: string) =>
    ["primary", "thematic", classId, termId] as const,
  ple: (yearId: string) => ["primary", "ple", yearId] as const,
};

export function usePrimaryOverview(termId?: string, enabled = true) {
  return useQuery({
    queryKey: primaryKeys.overview(termId),
    queryFn: () => primaryApi.overview(termId),
    enabled,
    staleTime: 30_000,
  });
}

export function usePrimarySetup(enabled = true) {
  return useQuery({
    queryKey: primaryKeys.setup,
    queryFn: () => primaryApi.getSetup(),
    enabled,
    staleTime: 60_000,
  });
}

export function usePrimaryClasses(enabled = true) {
  return useQuery({
    queryKey: primaryKeys.classes,
    queryFn: () => primaryApi.listClasses(),
    enabled,
    staleTime: 60_000,
  });
}

export function usePrimarySubjects(classLevel?: string, enabled = true) {
  return useQuery({
    queryKey: primaryKeys.subjects(classLevel),
    queryFn: () => primaryApi.listSubjects(classLevel),
    enabled,
    staleTime: 60_000,
  });
}

const EMPTY_ROSTER: Awaited<ReturnType<typeof primaryApi.roster>> = [];

export function usePrimaryRoster(classId: string, enabled = true) {
  return useQuery({
    queryKey: primaryKeys.roster(classId),
    queryFn: () => primaryApi.roster(classId),
    enabled: enabled && !!classId,
    staleTime: 30_000,
    // Stable empty list avoids `data ?? []` new-array identity loops in effects.
    placeholderData: EMPTY_ROSTER,
  });
}

export function usePrimaryClassResults(
  classId: string,
  termId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: primaryKeys.classResults(classId, termId),
    queryFn: () => primaryApi.classResults(classId, termId),
    enabled: enabled && !!classId && !!termId,
    staleTime: 15_000,
  });
}

export function useEnsurePrimarySetup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: primaryApi.ensureSetup,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["primary"] });
    },
  });
}

export function usePrimaryExamTypes(enabled = true, activeOnly = false) {
  return useQuery({
    queryKey: [...primaryKeys.examTypes, activeOnly ? "active" : "all"],
    queryFn: () => primaryApi.listExamTypes(activeOnly),
    enabled,
    staleTime: 60_000,
  });
}

export function usePrimaryExams(filters: PrimaryExamFilters = {}, enabled = true) {
  return useQuery({
    queryKey: primaryKeys.exams(filters),
    queryFn: () =>
      primaryApi.listExams({
        classId: filters.classId,
        termId: filters.termId,
        status: filters.status || undefined,
        includeDeleted: filters.includeDeleted,
      }),
    enabled,
    staleTime: 15_000,
  });
}

export function useCreatePrimaryExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePrimaryExamPayload) => primaryApi.createExam(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["primary", "exams"] }),
  });
}

export function useUpdatePrimaryExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; payload: UpdatePrimaryExamPayload }) =>
      primaryApi.updateExam(args.id, args.payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["primary", "exams"] }),
  });
}

export function useSoftDeletePrimaryExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => primaryApi.softDeleteExam(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["primary", "exams"] }),
  });
}

export function useHardDeletePrimaryExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => primaryApi.hardDeleteExam(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["primary", "exams"] }),
  });
}

export function useRestorePrimaryExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => primaryApi.restoreExam(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["primary", "exams"] }),
  });
}

export function useOpenPrimaryExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => primaryApi.openExam(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["primary", "exams"] }),
  });
}

export function useClosePrimaryExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => primaryApi.closeExam(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["primary", "exams"] }),
  });
}

export function useCreatePrimaryExamType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; code: string; sortOrder?: number }) =>
      primaryApi.createExamType(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: primaryKeys.examTypes }),
  });
}

export function useUpdatePrimaryExamType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; payload: UpdatePrimaryExamTypePayload }) =>
      primaryApi.updateExamType(args.id, args.payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: primaryKeys.examTypes }),
  });
}

export function useDeletePrimaryExamType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => primaryApi.deleteExamType(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: primaryKeys.examTypes }),
  });
}
