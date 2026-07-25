'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { alevelApi } from '@/lib/api/alevel';
import type {
  ALevelEnrollmentFilters,
  ALevelGradingScale,
  BulkALevelEnrollmentPayload,
  BulkUpdateALevelEnrollmentsPayload,
  CreateALevelCombinationPayload,
  CreateALevelEnrollmentPayload,
  CreateALevelSubjectPayload,
  UpdateALevelEnrollmentPayload,
  UpdateALevelSubjectPayload,
  SaveALevelGradesPayload,
} from '@makyschool/shared';

export const alevelKeys = {
  classes: ['alevel', 'classes'] as const,
  terms: ['alevel', 'terms'] as const,
  gradingScale: ['alevel', 'grading-scale'] as const,
  subjects: ['alevel', 'subjects'] as const,
  combinations: ['alevel', 'combinations'] as const,
  enrollments: (filters: string) => ['alevel', 'enrollments', filters] as const,
  grades: (classId: string, termId: string, yearId: string) =>
    ['alevel', 'grades', classId, termId, yearId] as const,
  results: (classId: string, termId: string, yearId: string) =>
    ['alevel', 'results', classId, termId, yearId] as const,
  reportCard: (studentId: string, termId: string, yearId: string) =>
    ['alevel', 'report-card', studentId, termId, yearId] as const,
};

/** S5/S6 classes only — combinations are an Advanced-level concept. */
export function useALevelClasses() {
  return useQuery({
    queryKey: alevelKeys.classes,
    queryFn: () => alevelApi.listClasses(),
    staleTime: 5 * 60_000,
  });
}

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
  filters: ALevelEnrollmentFilters,
  enabled = true,
) {
  const key = JSON.stringify(filters);
  return useQuery({
    queryKey: alevelKeys.enrollments(key),
    queryFn: () =>
      alevelApi.listEnrollments({
        academicYearId: filters.academicYearId || undefined,
        classId: filters.classId || undefined,
        combinationId: filters.combinationId || undefined,
        category: filters.category || undefined,
        search: filters.search || undefined,
      }),
    enabled: enabled && !!filters.academicYearId,
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

export function useBulkCreateALevelEnrollments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: BulkALevelEnrollmentPayload) =>
      alevelApi.bulkCreateEnrollments(payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['alevel', 'enrollments'] }),
  });
}

export function useUpdateALevelEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; payload: UpdateALevelEnrollmentPayload }) =>
      alevelApi.updateEnrollment(args.id, args.payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['alevel', 'enrollments'] }),
  });
}

export function useBulkUpdateALevelEnrollments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: BulkUpdateALevelEnrollmentsPayload) =>
      alevelApi.bulkUpdateEnrollments(payload),
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

export function useLockALevelTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      termId: string;
      classId: string;
      academicYearId: string;
    }) => alevelApi.lockTerm(args.termId, args.classId, args.academicYearId),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({
        queryKey: alevelKeys.grades(
          vars.classId,
          vars.termId,
          vars.academicYearId,
        ),
      });
    },
  });
}

export function useUnlockALevelTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      termId: string;
      classId: string;
      academicYearId: string;
    }) => alevelApi.unlockTerm(args.termId, args.classId, args.academicYearId),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({
        queryKey: alevelKeys.grades(
          vars.classId,
          vars.termId,
          vars.academicYearId,
        ),
      });
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

export function useALevelReportCard(
  studentId: string,
  termId: string,
  academicYearId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: alevelKeys.reportCard(studentId, termId, academicYearId),
    queryFn: () => alevelApi.getReportCard(studentId, termId, academicYearId),
    enabled: enabled && !!studentId && !!termId && !!academicYearId,
    staleTime: 15_000,
  });
}

export function useSaveALevelReportComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      studentId: string;
      termId: string;
      academicYearId: string;
      classId?: string | null;
      classTeacherComment?: string | null;
      headTeacherComment?: string | null;
      approve?: boolean;
    }) =>
      alevelApi.saveReportComment(
        args.studentId,
        args.termId,
        args.academicYearId,
        {
          classTeacherComment: args.classTeacherComment,
          headTeacherComment: args.headTeacherComment,
          approve: args.approve,
        },
        args.classId,
      ),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({
        queryKey: alevelKeys.reportCard(
          vars.studentId,
          vars.termId,
          vars.academicYearId,
        ),
      });
    },
  });
}

export function useGenerateALevelReportCards() {
  return useMutation({
    mutationFn: (params: {
      classId: string;
      termId: string;
      academicYearId: string;
      studentId?: string;
    }) => alevelApi.generateReportCards(params),
  });
}
