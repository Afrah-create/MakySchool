/**
 * Structural year-end promotion rules.
 *
 * Defaults promote within a track; terminal levels graduate.
 * S5 after O-Level is never automatic — schools enroll manually.
 */

export const ROLLOVER_TRACKS = ["primary", "secondary"] as const;
export type RolloverTrack = (typeof ROLLOVER_TRACKS)[number];

export const PROMOTION_ACTIONS = [
  "promote",
  "repeat",
  "graduate",
  "manual_next",
  "no_path",
] as const;
export type PromotionAction = (typeof PROMOTION_ACTIONS)[number];

/** Default next level. S4 → null (graduate O-Level; S5 is manual). */
export const DEFAULT_NEXT_LEVEL: Record<string, string | null> = {
  P1: "P2",
  P2: "P3",
  P3: "P4",
  P4: "P5",
  P5: "P6",
  P6: "P7",
  P7: null,
  S1: "S2",
  S2: "S3",
  S3: "S4",
  S4: null,
  S5: "S6",
  S6: null,
};

export const GRADUATION_LEVELS = ["P7", "S4", "S6"] as const;

/** Levels that complete a cycle and require separate enrollment for the next cycle. */
export const MANUAL_NEXT_ENROLLMENT_LEVELS = ["S4"] as const;

export function rolloverTrackForLevel(level: string): RolloverTrack | null {
  if (level.startsWith("P")) return "primary";
  if (level.startsWith("S")) return "secondary";
  return null;
}
