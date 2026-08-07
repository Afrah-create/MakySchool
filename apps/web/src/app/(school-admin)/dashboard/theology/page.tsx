"use client";

import { useMemo, useState } from "react";
import { Feather } from "lucide-react";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { useSchoolSWR } from "@/hooks/useSchoolSWR";
import { useCurrentTerm } from "@/hooks/useCurrentTerm";
import { apiClient } from "@/lib/api/client";
import type { ClassOption } from "@/lib/students/types";

type SubjectOption = {
  id: string;
  name: string;
  track: "secular" | "theology" | "both";
};

type RatingValue = "EE" | "ME" | "AE" | "BE" | "";

type RatingRow = {
  id: string | null;
  studentId: string;
  studentName: string;
  quranicRecitation: RatingValue;
  islamicValues: RatingValue;
  arabicLiteracy: RatingValue;
  moralCharacter: RatingValue;
};

type TheologyClassResponse = {
  id: string;
  studentId: string;
  studentName: string;
  quranicRecitation: RatingValue | null;
  islamicValues: RatingValue | null;
  arabicLiteracy: RatingValue | null;
  moralCharacter: RatingValue | null;
};

type StudentListItem = {
  id: string;
  full_name: string;
  class_id: string | null;
};

type StudentsListResponse = {
  students: StudentListItem[];
};

const RATING_FIELDS: Array<{
  key: keyof Pick
    RatingRow,
    "quranicRecitation" | "islamicValues" | "arabicLiteracy" | "moralCharacter"
  >;
  label: string;
}> = [
  { key: "quranicRecitation", label: "Qur'anic Recitation" },
  { key: "islamicValues", label: "Islamic Values" },
  { key: "arabicLiteracy", label: "Arabic Literacy" },
  { key: "moralCharacter", label: "Moral Character" },
];

function formatClassName(level: string, stream: string | null) {
  return stream ? `${level} ${stream}` : level;
}

export default function TheologyPage() {
  const { data: term } = useCurrentTerm();
  const { data: classes = [] } = useSchoolSWR<ClassOption[]>("/schools/classes");
  const { data: subjects = [] } = useSchoolSWR<SubjectOption[]>("/schools/subjects");

  const theologySubjects = useMemo(
    () => subjects.filter((s) => s.track === "theology" || s.track === "both"),
    [subjects],
  );

  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [rows, setRows] = useState<RatingRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const termId = term?.id ?? "";

  async function loadRoster(nextClassId: string, nextSubjectId: string) {
    if (!nextClassId || !nextSubjectId || !termId) {
      setRows([]);
      return;
    }
    setLoadingRows(true);
    try {
      const [studentsRes, ratingsRes] = await Promise.all([
        apiClient<StudentsListResponse>(
          `/schools/students?class_id=${nextClassId}&status=active&limit=200`,
        ),
        apiClient<TheologyClassResponse[]>(
          `/schools/theology/class/${nextClassId}?subject_id=${nextSubjectId}&term_id=${termId}`,
        ),
      ]);

      const existingByStudent = new Map(
        ratingsRes.data.map((r) => [r.studentId, r]),
      );

      setRows(
        studentsRes.data.students.map((s) => {
          const existing = existingByStudent.get(s.id);
          return {
            id: existing?.id ?? null,
            studentId: s.id,
            studentName: s.full_name,
            quranicRecitation: existing?.quranicRecitation ?? "",
            islamicValues: existing?.islamicValues ?? "",
            arabicLiteracy: existing?.arabicLiteracy ?? "",
            moralCharacter: existing?.moralCharacter ?? "",
          };
        }),
      );
    } finally {
      setLoadingRows(false);
    }
  }

  function handleClassChange(next: string) {
    setClassId(next);
    void loadRoster(next, subjectId);
  }

  function handleSubjectChange(next: string) {
    setSubjectId(next);
    void loadRoster(classId, next);
  }

  function updateRow(studentId: string, field: keyof RatingRow, value: string) {
    setRows((current) =>
      current.map((row) => (row.studentId === studentId ? { ...row, [field]: value } : row)),
    );
  }

  async function saveRow(row: RatingRow) {
    setSavingId(row.studentId);
    try {
      await apiClient("/schools/theology/ratings", {
        method: "PUT",
        body: {
          student_id: row.studentId,
          subject_id: subjectId,
          term_id: termId,
          class_id: classId,
          quranic_recitation: row.quranicRecitation || null,
          islamic_values: row.islamicValues || null,
          arabic_literacy: row.arabicLiteracy || null,
          moral_character: row.moralCharacter || null,
        },
      });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex items-start gap-3 border-b border-theme pb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-theme-accent-muted">
          <Feather className="h-5 w-5 text-theme-accent" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-theme-primary">
            Theology
          </h1>
          <p className="text-xs text-theme-muted">
            Record theology competency ratings{term?.name ? ` · ${term.name}` : ""}
          </p>
        </div>
      </div>

      {theologySubjects.length === 0 ? (
        <EmptyState
          title="No theology subjects yet"
          description="Mark a subject as Theology or Both on the Subjects page to start rating students."
        />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row flex-wrap gap-4 rounded-xl border border-theme bg-theme-raised/40 p-4 sm:items-end">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                Class
              </span>
              <select
                className="ms-input"
                value={classId}
                onChange={(e) => handleClassChange(e.target.value)}
              >
                <option value="">Select a class</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {formatClassName(c.level, c.stream)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                Subject
              </span>
              <select
                className="ms-input"
                value={subjectId}
                onChange={(e) => handleSubjectChange(e.target.value)}
              >
                <option value="">Select a subject</option>
                {theologySubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!classId || !subjectId ? (
            <EmptyState
              title="Pick a class and subject"
              description="Ratings are entered per class, per theology subject, for the current term."
            />
          ) : loadingRows ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState title="No students in this class" description="Nothing to rate here yet." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-theme">
              <table className="w-full text-sm">
                <thead className="bg-theme-raised/50 text-left text-[11px] font-semibold uppercase tracking-wider text-theme-muted">
                  <tr>
                    <th className="px-4 py-3">Student</th>
                    {RATING_FIELDS.map((f) => (
                      <th key={f.key} className="px-4 py-3">{f.label}</th>
                    ))}
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme">
                  {rows.map((row) => (
                    <tr key={row.studentId}>
                      <td className="px-4 py-2 font-medium text-theme-primary">{row.studentName}</td>
                      {RATING_FIELDS.map((f) => (
                        <td key={f.key} className="px-4 py-2">
                          <select
                            className="ms-input"
                            value={row[f.key]}
                            onChange={(e) => updateRow(row.studentId, f.key, e.target.value)}
                          >
                            <option value="">—</option>
                            <option value="EE">EE</option>
                            <option value="ME">ME</option>
                            <option value="AE">AE</option>
                            <option value="BE">BE</option>
                          </select>
                        </td>
                      ))}
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => saveRow(row)}
                          disabled={savingId === row.studentId}
                          className="rounded-lg border border-theme px-3 py-1.5 text-xs font-semibold text-theme-accent hover:border-theme-accent disabled:opacity-50"
                        >
                          {savingId === row.studentId ? "Saving…" : "Save"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}