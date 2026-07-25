import { apiClient } from '@/lib/api/client';
import { downloadBinaryFile } from '@/lib/api/downloadBinary';
import type {
  ALevelApprovedReportSummary,
  ALevelReportCard,
} from '@makyschool/shared';

const BASE = '/api/schools/learner/alevel';

export const learnerAlevelApi = {
  listApprovedReports() {
    return apiClient<{ reports: ALevelApprovedReportSummary[] }>(
      `${BASE}/report-cards`,
    ).then((r) => r.data.reports);
  },

  getApprovedReport(examId: string) {
    return apiClient<ALevelReportCard>(`${BASE}/report-cards/${examId}`).then(
      (r) => r.data,
    );
  },

  downloadApprovedPdf(examId: string) {
    return downloadBinaryFile(`${BASE}/report-cards/${examId}/pdf`, {
      method: 'GET',
      fallbackFilename: 'alevel-report.pdf',
    });
  },
};
