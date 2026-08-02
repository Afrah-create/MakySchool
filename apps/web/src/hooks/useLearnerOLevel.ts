import { useMutation, useQuery } from "@tanstack/react-query";
import { learnerOlevelApi } from "@/lib/api/learnerOlevel";

export const learnerOlevelKeys = {
  reports: ["learner", "olevel", "reportCards"] as const,
  report: (resultId: string) =>
    ["learner", "olevel", "reportCards", resultId] as const,
};

export function useLearnerOLevelApprovedReports(enabled = true) {
  return useQuery({
    queryKey: learnerOlevelKeys.reports,
    queryFn: () => learnerOlevelApi.listApprovedReports(),
    enabled,
    staleTime: 30_000,
  });
}

export function useLearnerOLevelApprovedReport(resultId: string, enabled = true) {
  return useQuery({
    queryKey: learnerOlevelKeys.report(resultId),
    queryFn: () => learnerOlevelApi.getApprovedReport(resultId),
    enabled: enabled && !!resultId,
    staleTime: 15_000,
  });
}

export function useDownloadLearnerOLevelReportPdf() {
  return useMutation({
    mutationFn: (resultId: string) =>
      learnerOlevelApi.downloadApprovedPdf(resultId),
  });
}
