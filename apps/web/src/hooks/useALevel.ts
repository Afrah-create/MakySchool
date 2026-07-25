'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { alevelApi } from '@/lib/api/alevel';
import type {
  ALevelEnrollmentFilters,
  ALevelExamFilters,
  ALevelGradingScale,
  BulkALevelEnrollmentPayload,
  BulkUpdateALevelEnrollmentsPayload,
  CreateALevelCombinationPayload,
  CreateALevelEnrollmentPayload,
  CreateALevelExamPayload,
  CreateALevelExamTypePayload,
  CreateALevelSubjectPayload,
  UpdateALevelEnrollmentPayload,
  UpdateALevelExamPayload,
  UpdateALevelExamTypePayload,
  UpdateALevelSubjectPayload,
  SaveALevelGradesPayload,
} from '@makyschool/shared';

export const alevelKeys = {
  classes: ['alevel', 'classes'] as const,
  terms: ['alevel', 'terms'] as const,
  gradingScale: ['alevel', 'grading-scale'] as const,
  examTypes: ['alevel', 'exam-types'] as const,
  exams: (filters: string) => ['alevel', 'exams', filters] as const,
  subjects: ['alevel', 'subjects'] as const,
  combinations: ['alevel', 'combinations'] as const,
  enrollments: (filters: string) => ['alevel', 'enrollments', filters] as const,
  grades: (examId: string) => ['alevel', 'grades', examId] as const,
  results: (examId: string) => ['alevel', 'results', examId] as const,
  reportCard: (studentId: string, examId: string) =>
    ['alevel', 'report-card', studentId, examId] as const,
};

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

export function useALevelExamTypes(includeInactive = false) {
  return useQuery({
    queryKey: [...alevelKeys.examTypes, includeInactive] as const,
    queryFn: () => alevelApi.listExamTypes(includeInactive),
    staleTime: 60_000,
  });
}

export function useCreateALevelExamType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateALevelExamTypePayload) =>
      alevelApi.createExamType(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: alevelKeys.examTypes }),
  });
}

export function useUpdateALevelExamType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; payload: UpdateALevelExamTypePayload }) =>
      alevelApi.updateExamType(args.id, args.payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: alevelKeys.examTypes }),
  });
}

export function useDeleteALevelExamType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => alevelApi.deleteExamType(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: alevelKeys.examTypes }),
  });
}

export function useALevelExams(filters: ALevelExamFilters, enabled = true) {
  const key = JSON.stringify(filters);
  return useQuery({
    queryKey: alevelKeys.exams(key),
    queryFn: () => alevelApi.listExams(filters),
    enabled,
    staleTime: 15_000,
  });
}

export function useCreateALevelExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateALevelExamPayload) =>
      alevelApi.createExam(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alevel', 'exams'] }),
  });
}

export function useUpdateALevelExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; payload: UpdateALevelExamPayload }) =>
      alevelApi.updateExam(args.id, args.payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alevel', 'exams'] }),
  });
}

export function useDeleteALevelExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => alevelApi.deleteExam(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alevel', 'exams'] }),
  });
}

export function useOpenALevelExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => alevelApi.openExam(id),
    onSuccess: (exam) => {
      qc.invalidateQueries({ queryKey: ['alevel', 'exams'] });
      qc.invalidateQueries({ queryKey: alevelKeys.grades(exam.id) });
    },
  });
}

export function useCloseALevelExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => alevelApi.closeExam(id),
    onSuccess: (exam) => {
      qc.invalidateQueries({ queryKey: ['alevel', 'exams'] });
      qc.invalidateQueries({ queryKey: alevelKeys.grades(exam.id) });
    },
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

export function useALevelGrades(examId: string, enabled = true) {
  return useQuery({
    queryKey: alevelKeys.grades(examId),
    queryFn: () => alevelApi.getGrades(examId),
    enabled: enabled && !!examId,
    staleTime: 15_000,
  });
}

export function useSaveALevelGrades() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveALevelGradesPayload) =>
      alevelApi.saveGrades(payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: alevelKeys.grades(vars.examId) });
      qc.invalidateQueries({ queryKey: ['alevel', 'results'] });
      qc.invalidateQueries({ queryKey: ['alevel', 'exams'] });
    },
  });
}

export function useSubmitALevelMarks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (examId: string) => alevelApi.submitMarks(examId),
    onSuccess: (_, examId) => {
      qc.invalidateQueries({ queryKey: alevelKeys.grades(examId) });
      qc.invalidateQueries({ queryKey: ['alevel', 'exams'] });
    },
  });
}

export function useUnlockALevelTeacherSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { examId: string; teacherId: string }) =>
      alevelApi.unlockTeacherSubmission(args.examId, args.teacherId),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: alevelKeys.grades(vars.examId) });
    },
  });
}

export function useALevelResults(examId: string, enabled = true) {
  return useQuery({
    queryKey: alevelKeys.results(examId),
    queryFn: () => alevelApi.getResults(examId),
    enabled: enabled && !!examId,
    staleTime: 15_000,
  });
}

export function useALevelReportCard(
  studentId: string,
  examId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: alevelKeys.reportCard(studentId, examId),
    queryFn: () => alevelApi.getReportCard(studentId, examId),
    enabled: enabled && !!studentId && !!examId,
    staleTime: 15_000,
  });
}

export function useSaveALevelReportComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      studentId: string;
      examId: string;
      classTeacherComment?: string | null;
      headTeacherComment?: string | null;
      approve?: boolean;
    }) =>
      alevelApi.saveReportComment(args.studentId, args.examId, {
        classTeacherComment: args.classTeacherComment,
        headTeacherComment: args.headTeacherComment,
        approve: args.approve,
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({
        queryKey: alevelKeys.reportCard(vars.studentId, vars.examId),
      });
    },
  });
}

export function useBulkSaveALevelReportComments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      examId: string;
      studentIds: string[];
      classTeacherComment?: string | null;
      headTeacherComment?: string | null;
      approve?: boolean;
    }) => alevelApi.bulkSaveReportComments(payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['alevel', 'reportCard'] });
      for (const studentId of vars.studentIds) {
        qc.invalidateQueries({
          queryKey: alevelKeys.reportCard(studentId, vars.examId),
        });
      }
    },
  });
}

export function useGenerateALevelReportCards() {
  return useMutation({
    mutationFn: (params: { examId: string; studentId?: string }) =>
      alevelApi.generateReportCards(params),
  });
}

