import { apiClient } from "@/lib/api/client";
import { downloadBinaryFile } from "@/lib/api/downloadBinary";
import type {
  OLevelApprovedReportSummary,
  OLevelReportCard,
} from "@makyschool/shared";

const BASE = "/api/schools/learner/olevel";

export const learnerOlevelApi = {
  listApprovedReports() {
    return apiClient<{ reports: OLevelApprovedReportSummary[] }>(
      `${BASE}/report-cards`,
    ).then((r) => r.data.reports);
  },

  getApprovedReport(resultId: string) {
    return apiClient<OLevelReportCard>(`${BASE}/report-cards/${resultId}`).then(
      (r) => r.data,
    );
  },

  downloadApprovedPdf(resultId: string) {
    return downloadBinaryFile(`${BASE}/report-cards/${resultId}/pdf`, {
      method: "GET",
      fallbackFilename: "olevel-report.pdf",
    });
  },
};
