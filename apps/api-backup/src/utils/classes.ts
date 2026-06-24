import { getLevelsForSchoolType } from "@makyschool/shared/constants";
import type { SchoolType } from "@makyschool/shared/types";
import { pool } from "../db/pool.js";

export function formatClassLabel(level: string, stream: string | null): string {
  return `${level}${stream ?? ""}`;
}

export function isLevelAllowedForSchoolType(level: string, schoolType: SchoolType | null): boolean {
  return getLevelsForSchoolType(schoolType).includes(level);
}

export async function getSchoolType(schoolId: string): Promise<SchoolType | null> {
  const result = await pool.query<{ school_type: SchoolType | null }>(
    "SELECT school_type FROM schools WHERE id = $1",
    [schoolId],
  );
  return result.rows[0]?.school_type ?? null;
}

export function getAllowedLevelsSqlParam(schoolType: SchoolType | null): string[] {
  return getLevelsForSchoolType(schoolType);
}

export function buildLevelOrderCase(columnRef: string, schoolType: SchoolType | null): string {
  const levels = getLevelsForSchoolType(schoolType);
  if (levels.length === 0) {
    return "0";
  }

  const cases = levels
    .map((level, index) => `WHEN ${columnRef} = '${level}' THEN ${index}`)
    .join(" ");

  return `CASE ${cases} ELSE ${levels.length} END`;
}

export async function findDuplicateClass(
  schoolId: string,
  level: string,
  stream: string | null,
  excludeId?: string,
): Promise<boolean> {
  const result = await pool.query(
    `SELECT id FROM school_classes
     WHERE school_id = $1
       AND level = $2
       AND COALESCE(stream, '') = COALESCE($3, '')
       AND ($4::uuid IS NULL OR id <> $4)
     LIMIT 1`,
    [schoolId, level, stream ?? "", excludeId ?? null],
  );
  return (result.rowCount ?? 0) > 0;
}
