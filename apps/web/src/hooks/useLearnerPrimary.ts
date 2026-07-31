import { useMutation, useQuery } from '@tanstack/react-query';
import { learnerPrimaryApi } from '@/lib/api/learnerPrimary';

export const learnerPrimaryKeys = {
  reports: ['learner', 'primary', 'reportCards'] as const,
  report: (examId: string) =>
    ['learner', 'primary', 'reportCards', examId] as const,
};

export function useLearnerPrimaryApprovedReports(enabled = true) {
  return useQuery({
    queryKey: learnerPrimaryKeys.reports,
    queryFn: () => learnerPrimaryApi.listApprovedReports(),
    enabled,
    staleTime: 30_000,
  });
}

export function useLearnerPrimaryApprovedReport(examId: string, enabled = true) {
  return useQuery({
    queryKey: learnerPrimaryKeys.report(examId),
    queryFn: () => learnerPrimaryApi.getApprovedReport(examId),
    enabled: enabled && !!examId,
    staleTime: 15_000,
  });
}

export function useDownloadLearnerPrimaryReportPdf() {
  return useMutation({
    mutationFn: (examId: string) =>
      learnerPrimaryApi.downloadApprovedPdf(examId),
  });
}
