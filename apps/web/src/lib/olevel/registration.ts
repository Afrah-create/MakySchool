import type {
  CurriculumSubject,
  OLevelClassOption,
  OLevelLevelBand,
  OLevelTermOption,
  SelectionRule,
  StudentCurriculumEnrollment,
} from "@makyschool/shared";
import { OLEVEL_LEVEL_BANDS } from "@makyschool/shared";

export function bandForLevel(level?: string | null): OLevelLevelBand | null {
  if (!level) return null;
  if (level === "S1" || level === "S2") return "S1-S2";
  if (level === "S3" || level === "S4") return "S3-S4";
  return null;
}

export function levelsForBand(band: OLevelLevelBand): string[] {
  return OLEVEL_LEVEL_BANDS[band].levels;
}

export function subjectsForLevel(
  subjects: CurriculumSubject[],
  level: string,
  role?: "compulsory" | "optional" | "co_curricular",
): CurriculumSubject[] {
  return subjects.filter(
    (s) =>
      s.appliesToLevels.includes(level) &&
      (role ? s.subjectRole === role : true),
  );
}

export function roleForSubjectInBand(
  assigned: CurriculumSubject[],
  subjectId: string,
  band: OLevelLevelBand,
): "compulsory" | "optional" | "co_curricular" | "" {
  const levels = new Set(levelsForBand(band));
  const match = assigned.find(
    (s) =>
      s.subjectId === subjectId &&
      s.appliesToLevels.some((lv) => levels.has(lv)),
  );
  return (match?.subjectRole as "compulsory" | "optional" | "co_curricular") ?? "";
}

export function selectionRuleForLevel(
  rules: SelectionRule[] | undefined,
  level: string,
): SelectionRule | undefined {
  return rules?.find((r) => r.appliesToLevels.includes(level));
}

export function describeSelectionRule(rule?: SelectionRule | null): string {
  if (!rule) return "No selection rule configured for this class level.";
  const opt =
    rule.optionalMin === rule.optionalMax
      ? `exactly ${rule.optionalMin} optional`
      : `${rule.optionalMin}–${rule.optionalMax} optional`;
  return `Requires ${rule.compulsoryCount} compulsory and ${opt} subject${rule.optionalMax === 1 ? "" : "s"}.`;
}

export function buildRegistrationPayload(
  subjects: CurriculumSubject[],
  level: string,
  optionalIds: string[],
): Array<{ subjectId: string; subjectRole: string }> {
  const compulsory = subjectsForLevel(subjects, level, "compulsory").map((s) => ({
    subjectId: s.subjectId,
    subjectRole: "compulsory" as const,
  }));
  const optional = optionalIds.map((subjectId) => ({
    subjectId,
    subjectRole: "optional" as const,
  }));
  return [...compulsory, ...optional];
}

export function validateOptionalSelection(
  rule: SelectionRule | undefined,
  compulsoryCount: number,
  optionalCount: number,
): string | null {
  if (!rule) return "No selection rule applies to this class.";
  if (compulsoryCount !== rule.compulsoryCount) {
    return `Curriculum has ${compulsoryCount} compulsory subjects for this level; rule requires ${rule.compulsoryCount}. Update curriculum subjects first.`;
  }
  if (optionalCount < rule.optionalMin || optionalCount > rule.optionalMax) {
    return `Select ${rule.optionalMin === rule.optionalMax ? `exactly ${rule.optionalMin}` : `${rule.optionalMin}–${rule.optionalMax}`} optional subject(s).`;
  }
  return null;
}

export function registrationStatus(
  enrollment: StudentCurriculumEnrollment,
  rule?: SelectionRule | null,
): "complete" | "partial" | "none" {
  const total = enrollment.registeredSubjectCount ?? 0;
  const optional = enrollment.optionalSubjectCount ?? 0;
  if (total === 0) return "none";
  if (!rule) return total > 0 ? "partial" : "none";
  const compulsory = enrollment.compulsorySubjectCount ?? 0;
  if (
    compulsory === rule.compulsoryCount &&
    optional >= rule.optionalMin &&
    optional <= rule.optionalMax
  ) {
    return "complete";
  }
  return "partial";
}

/** Default class = first class; default year = current term's year (else first). */
export function defaultClassAndYear(
  classes: OLevelClassOption[],
  terms: OLevelTermOption[],
): { classId: string; yearId: string; termId: string } {
  const current = terms.find((t) => t.isCurrent) ?? terms[0];
  return {
    classId: classes[0]?.id ?? "",
    yearId: current?.academicYearId ?? "",
    termId: current?.id ?? "",
  };
}
