import { apiClient } from '@/lib/api/client';
import { downloadBinaryFile } from '@/lib/api/downloadBinary';
import type {
  PrimaryApprovedReportSummary,
  PrimaryReportCard,
} from '@makyschool/shared';

const BASE = '/api/schools/learner/primary';

export const learnerPrimaryApi = {
  listApprovedReports() {
    return apiClient<{ reports: PrimaryApprovedReportSummary[] }>(
      `${BASE}/report-cards`,
    ).then((r) => r.data.reports);
  },

  getApprovedReport(examId: string) {
    return apiClient<PrimaryReportCard>(`${BASE}/report-cards/${examId}`).then(
      (r) => r.data,
    );
  },

  downloadApprovedPdf(examId: string) {
    return downloadBinaryFile(`${BASE}/report-cards/${examId}/pdf`, {
      method: 'GET',
      fallbackFilename: 'primary-report.pdf',
    });
  },
};
