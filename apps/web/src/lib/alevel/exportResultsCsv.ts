/** Client-side A-Level results CSV export (Excel-friendly). */

import type {
  ALevelSubject,
  ALevelStudentResult,
  ALevelResultsSummary,
} from '@makyschool/shared';

export type ALevelResultsSortKey =
  | 'position'
  | 'name'
  | 'learnerId'
  | 'totalPoints'
  | 'resultCode';

export type ALevelResultsSortDir = 'asc' | 'desc';

const RESULT_LABEL: Record<string, string> = {
  '1': 'Certificate Eligible',
  '2': 'Partial Pass',
  '6': 'Incomplete',
};

export const ALEVEL_RESULTS_SORT_OPTIONS: Array<{
  key: ALevelResultsSortKey;
  label: string;
}> = [
  { key: 'position', label: 'Position (rank)' },
  { key: 'name', label: 'Student name' },
  { key: 'learnerId', label: 'Learner ID' },
  { key: 'totalPoints', label: 'Total points' },
  { key: 'resultCode', label: 'Result code' },
];

function csvEscape(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function subjectCell(
  result: ALevelStudentResult,
  subjectId: string,
): { grade: string; score: string; points: string } {
  const subject = result.subjects.find((s) => s.subjectId === subjectId);
  return {
    grade: subject?.grade ?? '',
    score: subject?.rawScore != null ? String(subject.rawScore) : '',
    points: subject?.points != null ? String(subject.points) : '',
  };
}

export function sortALevelResults(
  results: ALevelStudentResult[],
  sortKey: ALevelResultsSortKey,
  sortDir: ALevelResultsSortDir,
): ALevelStudentResult[] {
  const mult = sortDir === 'asc' ? 1 : -1;
  const sorted = [...results].sort((a, b) => {
    switch (sortKey) {
      case 'name':
        return (
          mult *
          (a.studentName || '').localeCompare(b.studentName || '', undefined, {
            sensitivity: 'base',
          })
        );
      case 'learnerId':
        return (
          mult *
          (a.learnerId || '').localeCompare(b.learnerId || '', undefined, {
            numeric: true,
            sensitivity: 'base',
          })
        );
      case 'totalPoints':
        return mult * (a.total_points - b.total_points);
      case 'resultCode':
        return (
          mult *
          (a.result_code || '').localeCompare(b.result_code || '', undefined, {
            numeric: true,
          })
        );
      case 'position':
      default: {
        const byPos = a.position - b.position;
        if (byPos !== 0) return mult * byPos;
        return mult * (b.total_points - a.total_points);
      }
    }
  });
  return sorted;
}

export type BuildALevelResultsCsvInput = {
  results: ALevelStudentResult[];
  subjects: ALevelSubject[];
  summary?: ALevelResultsSummary | null;
  meta: {
    schoolName?: string | null;
    className?: string | null;
    termName?: string | null;
    examName?: string | null;
    examTypeName?: string | null;
    academicYearLabel?: string | null;
  };
  sortKey?: ALevelResultsSortKey;
  sortDir?: ALevelResultsSortDir;
  exportedAt?: Date;
};

/**
 * Build a CSV string with:
 * - metadata title block
 * - dual-row column headers (group + field)
 * - sorted student rows (grade / score / points per subject)
 * - optional subject summary section
 */
export function buildALevelResultsCsv(input: BuildALevelResultsCsvInput): string {
  const sortKey = input.sortKey ?? 'position';
  const sortDir = input.sortDir ?? 'asc';
  const exportedAt = input.exportedAt ?? new Date();
  const sorted = sortALevelResults(input.results, sortKey, sortDir);
  const subjects = input.subjects;
  const sortLabel =
    ALEVEL_RESULTS_SORT_OPTIONS.find((o) => o.key === sortKey)?.label ??
    sortKey;

  const lines: string[][] = [];

  // ── Metadata block ──────────────────────────────────────────────────────
  lines.push(['A-Level Results Export']);
  lines.push(['School', input.meta.schoolName ?? '']);
  lines.push(['Class', input.meta.className ?? '']);
  lines.push(['Term', input.meta.termName ?? '']);
  if (input.meta.academicYearLabel) {
    lines.push(['Academic year', input.meta.academicYearLabel]);
  }
  lines.push([
    'Exam',
    [
      input.meta.examName,
      input.meta.examTypeName ? `(${input.meta.examTypeName})` : null,
    ]
      .filter(Boolean)
      .join(' '),
  ]);
  lines.push(['Exported at', exportedAt.toLocaleString()]);
  lines.push(['Students', String(sorted.length)]);
  lines.push([
    'Sorted by',
    `${sortLabel} (${sortDir === 'asc' ? 'ascending' : 'descending'})`,
  ]);
  lines.push([]); // blank separator

  // ── Dual header rows ────────────────────────────────────────────────────
  const groupHeader: string[] = [
    'Rank',
    'Student',
    'Student',
    'Student',
  ];
  const fieldHeader: string[] = [
    'Position',
    'Full name',
    'Learner ID',
    'Combination',
  ];

  for (const subject of subjects) {
    const label = `${subject.name} (${subject.code})`;
    groupHeader.push(label, label, label);
    fieldHeader.push('Grade', 'Score', 'Points');
  }

  groupHeader.push(
    'Totals',
    'Totals',
    'Totals',
    'Totals',
    'Totals',
    'Result',
    'Result',
  );
  fieldHeader.push(
    'Principal points',
    'GP points',
    'Subsidiary points',
    'Total points',
    'Principal passes',
    'Code',
    'Label',
  );

  lines.push(groupHeader);
  lines.push(fieldHeader);

  // ── Data rows ───────────────────────────────────────────────────────────
  for (const row of sorted) {
    const cells: string[] = [
      String(row.position),
      row.studentName,
      row.learnerId,
      row.combinationName,
    ];
    for (const subject of subjects) {
      const cell = subjectCell(row, subject.id);
      cells.push(cell.grade, cell.score, cell.points);
    }
    cells.push(
      String(row.best_principal_points),
      String(row.gp_points),
      String(row.subsidiary_points),
      String(row.total_points),
      String(row.principal_pass_count),
      row.result_code,
      RESULT_LABEL[row.result_code] ?? row.result_code,
    );
    lines.push(cells);
  }

  // ── Subject summary ─────────────────────────────────────────────────────
  const stats = input.summary?.subjectStats ?? [];
  if (stats.length > 0) {
    lines.push([]);
    lines.push(['Subject pass rates']);
    lines.push([
      'Subject code',
      'Subject name',
      'Students sat',
      'Pass rate %',
      'Average points',
    ]);
    const orderedStats = [...stats].sort((a, b) =>
      a.code.localeCompare(b.code, undefined, { sensitivity: 'base' }),
    );
    for (const stat of orderedStats) {
      lines.push([
        stat.code,
        stat.subjectName,
        String(stat.sat),
        String(stat.passRate),
        String(stat.averagePoints),
      ]);
    }

    if (input.summary) {
      lines.push([]);
      lines.push(['Class summary']);
      lines.push(['Metric', 'Value']);
      lines.push(['Student count', String(input.summary.studentCount)]);
      lines.push(['Average points', String(input.summary.averagePoints)]);
      lines.push([
        'Certificate eligible',
        `${input.summary.certificateEligible} (${input.summary.certificateEligiblePercent}%)`,
      ]);
      lines.push([
        '2 principal passes',
        String(input.summary.twoPrincipalPasses),
      ]);
      lines.push([
        '3 principal passes',
        String(input.summary.threePrincipalPasses),
      ]);
    }
  }

  const body = lines.map((row) => row.map(csvEscape).join(',')).join('\r\n');
  // UTF-8 BOM helps Excel recognise encoding.
  return `\uFEFF${body}\r\n`;
}

export function downloadALevelResultsCsv(
  filename: string,
  csvContent: string,
): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function alevelResultsCsvFilename(parts: {
  className?: string;
  examName?: string;
  termName?: string;
}): string {
  const slug = (value?: string) =>
    (value || '')
      .trim()
      .replace(/[^\w.-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();

  const bits = [
    'alevel-results',
    slug(parts.className) || 'class',
    slug(parts.examName) || slug(parts.termName) || 'exam',
  ];
  return `${bits.join('-')}.csv`;
}
