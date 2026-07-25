import { useMutation, useQuery } from '@tanstack/react-query';
import { learnerAlevelApi } from '@/lib/api/learnerAlevel';

export const learnerAlevelKeys = {
  reports: ['learner', 'alevel', 'reportCards'] as const,
  report: (examId: string) =>
    ['learner', 'alevel', 'reportCards', examId] as const,
};

export function useLearnerApprovedReports(enabled = true) {
  return useQuery({
    queryKey: learnerAlevelKeys.reports,
    queryFn: () => learnerAlevelApi.listApprovedReports(),
    enabled,
    staleTime: 30_000,
  });
}

export function useLearnerApprovedReport(examId: string, enabled = true) {
  return useQuery({
    queryKey: learnerAlevelKeys.report(examId),
    queryFn: () => learnerAlevelApi.getApprovedReport(examId),
    enabled: enabled && !!examId,
    staleTime: 15_000,
  });
}

export function useDownloadLearnerReportPdf() {
  return useMutation({
    mutationFn: (examId: string) => learnerAlevelApi.downloadApprovedPdf(examId),
  });
}
