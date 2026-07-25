'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { alevelApi } from '@/lib/api/alevel';
import type {
  ALevelGradingScale,
  CreateALevelCombinationPayload,
  CreateALevelEnrollmentPayload,
  CreateALevelSubjectPayload,
  UpdateALevelSubjectPayload,
  SaveALevelGradesPayload,
} from '@makyschool/shared';

export const alevelKeys = {
  terms: ['alevel', 'terms'] as const,
  gradingScale: ['alevel', 'grading-scale'] as const,
  subjects: ['alevel', 'subjects'] as const,
  combinations: ['alevel', 'combinations'] as const,
  enrollments: (yearId: string, classId: string) =>
    ['alevel', 'enrollments', yearId, classId] as const,
  grades: (classId: string, termId: string, yearId: string) =>
    ['alevel', 'grades', classId, termId, yearId] as const,
  results: (classId: string, termId: string, yearId: string) =>
    ['alevel', 'results', classId, termId, yearId] as const,
};

export function useALevelTerms() {
  return useQuery({
    queryKey: alevelKeys.terms,
    queryFn: () => alevelApi.listTerms(),
    staleTime: 5 * 60_000,
  });
}

export function useALevelGradingScale() {
  return useQuery({
    queryKey: alevelKeys.gradingScale,
    queryFn: () => alevelApi.getGradingScale(),
    staleTime: 5 * 60_000,
  });
}

export function useSaveALevelGradingScale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ALevelGradingScale) =>
      alevelApi.saveGradingScale(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: alevelKeys.gradingScale }),
  });
}

export function useALevelSubjects() {
  return useQuery({
    queryKey: alevelKeys.subjects,
    queryFn: () => alevelApi.listSubjects(),
    staleTime: 60_000,
  });
}

export function useCreateALevelSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateALevelSubjectPayload) =>
      alevelApi.createSubject(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: alevelKeys.subjects }),
  });
}

export function useUpdateALevelSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; payload: UpdateALevelSubjectPayload }) =>
      alevelApi.updateSubject(args.id, args.payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: alevelKeys.subjects }),
  });
}

export function useDeleteALevelSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => alevelApi.deleteSubject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: alevelKeys.subjects }),
  });
}

export function useALevelCombinations() {
  return useQuery({
    queryKey: alevelKeys.combinations,
    queryFn: () => alevelApi.listCombinations(),
    staleTime: 60_000,
  });
}

export function useCreateALevelCombination() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateALevelCombinationPayload) =>
      alevelApi.createCombination(payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: alevelKeys.combinations }),
  });
}

export function useUpdateALevelCombination() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: string;
      payload: CreateALevelCombinationPayload;
    }) => alevelApi.updateCombination(args.id, args.payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: alevelKeys.combinations }),
  });
}

export function useDeleteALevelCombination() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => alevelApi.deleteCombination(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: alevelKeys.combinations }),
  });
}

export function useALevelEnrollments(
  academicYearId: string,
  classId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: alevelKeys.enrollments(academicYearId, classId),
    queryFn: () =>
      alevelApi.listEnrollments({
        academicYearId: academicYearId || undefined,
        classId: classId || undefined,
      }),
    enabled: enabled && !!academicYearId,
    staleTime: 30_000,
  });
}

export function useCreateALevelEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateALevelEnrollmentPayload) =>
      alevelApi.createEnrollment(payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['alevel', 'enrollments'] }),
  });
}

export function useDeleteALevelEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => alevelApi.deleteEnrollment(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['alevel', 'enrollments'] }),
  });
}

export function useALevelGrades(
  classId: string,
  termId: string,
  academicYearId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: alevelKeys.grades(classId, termId, academicYearId),
    queryFn: () => alevelApi.getGrades(classId, termId, academicYearId),
    enabled: enabled && !!classId && !!termId && !!academicYearId,
    staleTime: 15_000,
  });
}

export function useSaveALevelGrades() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveALevelGradesPayload) =>
      alevelApi.saveGrades(payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({
        queryKey: alevelKeys.grades(
          vars.classId,
          vars.termId,
          vars.academicYearId,
        ),
      });
      qc.invalidateQueries({ queryKey: ['alevel', 'results'] });
    },
  });
}

export function useALevelResults(
  classId: string,
  termId: string,
  academicYearId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: alevelKeys.results(classId, termId, academicYearId),
    queryFn: () => alevelApi.getResults(classId, termId, academicYearId),
    enabled: enabled && !!classId && !!termId && !!academicYearId,
    staleTime: 15_000,
  });
}
