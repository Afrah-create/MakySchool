import type { SchoolType } from "../types";

export const PRIMARY_CLASS_LEVELS = ["P1", "P2", "P3", "P4", "P5", "P6", "P7"] as const;
export const SECONDARY_CLASS_LEVELS = ["S1", "S2", "S3", "S4", "S5", "S6"] as const;

/** Advanced level — the only classes that take subject combinations. */
export const A_LEVEL_CLASS_LEVELS = ["S5", "S6"] as const;

export function isALevelClassLevel(level: string): boolean {
  return (A_LEVEL_CLASS_LEVELS as readonly string[]).includes(level);
}

export function schoolOffersPrimary(schoolType: SchoolType | string | null | undefined): boolean {
  return schoolType === "primary" || schoolType === "both";
}

/** Secondary and combined schools offer A-Level (S5/S6). Primary-only schools do not. */
export function schoolOffersALevel(schoolType: SchoolType | string | null | undefined): boolean {
  return schoolType === "secondary" || schoolType === "both";
}

export function isLowerPrimaryLevel(level: string): boolean {
  return level === "P1" || level === "P2" || level === "P3";
}

export function isUpperPrimaryLevel(level: string): boolean {
  return level === "P4" || level === "P5" || level === "P6" || level === "P7";
}

export function getLevelsForSchoolType(schoolType: SchoolType | string | null): string[] {
  if (schoolType === "secondary") {
    return [...SECONDARY_CLASS_LEVELS];
  }
  if (schoolType === "both") {
    return [...PRIMARY_CLASS_LEVELS, ...SECONDARY_CLASS_LEVELS];
  }
  return [...PRIMARY_CLASS_LEVELS];
}

export function getLevelSectionsForSchoolType(schoolType: SchoolType | string | null) {
  if (schoolType === "both") {
    return [
      { label: "Primary", levels: [...PRIMARY_CLASS_LEVELS] },
      { label: "Secondary", levels: [...SECONDARY_CLASS_LEVELS] },
    ];
  }
  return [{ label: null as string | null, levels: getLevelsForSchoolType(schoolType) }];
}

export function formatClassLabel(level: string, stream: string | null): string {
  return `${level}${stream ?? ""}`;
}

export function isLevelAllowedForSchoolType(
  level: string,
  schoolType: SchoolType | string | null,
): boolean {
  return getLevelsForSchoolType(schoolType).includes(level);
}

export function sortClasses<T extends { level: string; stream: string | null }>(
  classes: T[],
  schoolType: SchoolType | string | null,
): T[] {
  const levelOrder = getLevelsForSchoolType(schoolType);
  return [...classes].sort((a, b) => {
    const levelIndex = levelOrder.indexOf(a.level) - levelOrder.indexOf(b.level);
    if (levelIndex !== 0) {
      return levelIndex;
    }
    return (a.stream ?? "").localeCompare(b.stream ?? "");
  });
}

export function groupClassesByLevel<T extends { level: string; stream: string | null }>(
  classes: T[],
  schoolType: SchoolType | string | null,
): Array<{ level: string; items: T[] }> {
  const sorted = sortClasses(classes, schoolType);
  const groups = new Map<string, T[]>();

  for (const classRow of sorted) {
    const existing = groups.get(classRow.level) ?? [];
    existing.push(classRow);
    groups.set(classRow.level, existing);
  }

  return Array.from(groups.entries()).map(([level, items]) => ({ level, items }));
}
