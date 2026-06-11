export const PRIMARY_CLASS_LEVELS = ["P1", "P2", "P3", "P4", "P5", "P6", "P7"] as const;
export const SECONDARY_CLASS_LEVELS = ["S1", "S2", "S3", "S4", "S5", "S6"] as const;

export function getLevelsForSchoolType(schoolType: string | null) {
  if (schoolType === "secondary") {
    return [...SECONDARY_CLASS_LEVELS];
  }
  if (schoolType === "both") {
    return [...PRIMARY_CLASS_LEVELS, ...SECONDARY_CLASS_LEVELS];
  }
  return [...PRIMARY_CLASS_LEVELS];
}
