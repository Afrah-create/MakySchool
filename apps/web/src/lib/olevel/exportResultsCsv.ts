/** Client-side O-Level class results CSV export. */

import type { OLevelStudentResult } from "@makyschool/shared";

function csvEscape(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function exportOLevelResultsCsv(options: {
  className: string;
  termName: string;
  academicYearName: string;
  students: OLevelStudentResult[];
}): void {
  const { className, termName, academicYearName, students } = options;
  const subjectCodes = Array.from(
    new Set(
      students.flatMap((s) =>
        (s.subjectResults ?? []).map((x) => x.subjectCode || x.subjectName || x.subjectId),
      ),
    ),
  ).sort();

  const header = [
    "Position",
    "Student",
    "Student ID",
    "Total points",
    "Average %",
    "Promoted",
    "Approved",
    ...subjectCodes.flatMap((code) => [`${code} %`, `${code} grade`, `${code} pts`]),
  ];

  const rows = students.map((s) => {
    const byCode = new Map(
      (s.subjectResults ?? []).map((x) => [
        x.subjectCode || x.subjectName || x.subjectId,
        x,
      ]),
    );
    return [
      s.classPosition ?? "",
      s.studentName ?? "",
      s.learnerId ?? "",
      s.totalPoints,
      s.averagePercent.toFixed(1),
      s.isPromoted === null ? "" : s.isPromoted ? "Yes" : "No",
      s.approvedAt ? "Yes" : "No",
      ...subjectCodes.flatMap((code) => {
        const sub = byCode.get(code);
        return [
          sub?.weightedScore != null ? sub.weightedScore.toFixed(1) : "",
          sub?.grade ?? "",
          sub?.points ?? "",
        ];
      }),
    ];
  });

  const lines = [
    `# O-Level results · ${className} · ${termName} · ${academicYearName}`,
    header.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(",")),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `olevel-results-${className.replace(/\s+/g, "-").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
