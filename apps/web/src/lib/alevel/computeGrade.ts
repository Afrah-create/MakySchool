import type { ALevelGradeBand, ALevelSubjectType } from '@makyschool/shared';

/** Client-side preview mirroring `app.lib.alevel.compute_grade`. */
export function computeGradePreview(
  score: number,
  subjectType: ALevelSubjectType,
  bands: ALevelGradeBand[],
  subsidiaryPassThreshold: number,
): { grade: string; points: number } {
  const value = Math.max(0, Math.min(100, score));

  if (subjectType === 'subsidiary') {
    if (value >= subsidiaryPassThreshold) return { grade: 'P', points: 1 };
    return { grade: 'F', points: 0 };
  }

  const ordered = [...bands].sort((a, b) => b.minScore - a.minScore);
  for (const band of ordered) {
    if (value >= band.minScore) {
      return { grade: band.grade, points: band.points };
    }
  }
  return { grade: 'F', points: 0 };
}

export function gradeBorderClass(grade: string | null | undefined): string {
  if (!grade) return 'border-theme';
  const g = grade.toUpperCase();
  if (g === 'A' || g === 'P') return 'border-emerald-500/60';
  if (g === 'B' || g === 'C') return 'border-sky-500/50';
  if (g === 'D' || g === 'E') return 'border-amber-500/50';
  if (g === 'O') return 'border-orange-500/50';
  return 'border-rose-500/50';
}
