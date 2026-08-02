"use client";

import Link from "next/link";
import { useState } from "react";
import { BookOpenCheck, ClipboardList, FileText, Settings2, UsersRound } from "lucide-react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { schoolOffersOLevel } from "@makyschool/shared";
import { useOLevelCurriculum, useOLevelOverview, useSetupOLevelCurriculum } from "@/hooks/useOLevel";
import { useSchool } from "@/providers/SchoolProvider";
import { useToast } from "@/providers/ToastProvider";

const links = [
  ["/dashboard/olevel/exam-sessions", "Exam sessions", ClipboardList],
  ["/dashboard/olevel/students", "Students", UsersRound],
  ["/dashboard/olevel/results", "Results", FileText],
  ["/dashboard/olevel/marks", "Marks review", BookOpenCheck],
  ["/dashboard/olevel/setup", "Curriculum setup", Settings2],
] as const;

export function OLevelOverviewContent() {
  const { school } = useSchool();
  const { toast } = useToast();
  const offers = schoolOffersOLevel(school?.school_type);
  const { data: curriculum, isPending: curriculumPending } = useOLevelCurriculum(offers);
  const { data: overview, isPending: overviewPending } = useOLevelOverview(offers);
  const setup = useSetupOLevelCurriculum();
  const [year, setYear] = useState(new Date().getFullYear());

  if (!offers) return <DashboardPage embedded maxWidth="7xl" eyebrow="Academic" title="O-Level"><EmptyState icon={BookOpenCheck} title="O-Level not enabled" description="This school is not configured to offer secondary O-Level classes." /></DashboardPage>;
  async function create() {
    try { await setup.mutateAsync({ academicYearFrom: year, seedDefaults: true }); toast.success("O-Level curriculum created with CBC defaults."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not set up O-Level."); }
  }
  return <DashboardPage embedded maxWidth="7xl" eyebrow="Academic" title="O-Level" description="NLSC CBC curriculum, assessment and results">
    {(curriculumPending || overviewPending) ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
    : !curriculum ? <div className="rounded-xl border border-theme bg-theme-surface p-6 space-y-4"><div><h2 className="font-semibold text-theme-primary">Set up O-Level</h2><p className="mt-1 text-sm text-theme-muted">Seed the Uganda NLSC CBC grade scale, categories, selection rules and subjects.</p></div><label className="block max-w-xs text-sm text-theme-muted">Curriculum starts <input className="ms-input mt-1 w-full" type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} /></label><LoadingButton loading={setup.isPending} onClick={() => void create()}>Set up O-Level (CBC defaults)</LoadingButton></div>
    : <div className="space-y-6"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Enrolled students" value={overview?.enrolledCount ?? 0} /><Stat label="Curriculum subjects" value={overview?.subjects ?? 0} /><Stat label="Open sessions" value={overview?.openSessions ?? 0} /><Stat label="Pending approval" value={overview?.resultsPendingApproval ?? 0} />
    </div>
    <div className="rounded-xl border border-theme bg-theme-surface p-4 text-sm text-theme-muted">
      <p className="font-medium text-theme-primary">Suggested workflow</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>Curriculum setup — set compulsory/optional subjects for S1–S2 and S3–S4</li>
        <li>Students — bulk enroll the class, then apply optional packages to groups</li>
        <li>Exam sessions — open CA / end-of-term sessions for mark entry</li>
        <li>Results — generate grades &amp; rankings, comments, approve, then download reports</li>
      </ol>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{links.map(([href, label, Icon]) => <Link key={href} href={href} className="flex items-center gap-3 rounded-xl border border-theme bg-theme-surface p-4 transition hover:border-theme-accent"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-theme-raised text-theme-muted"><Icon className="h-5 w-5" /></span><span className="font-medium text-theme-primary">{label}</span></Link>)}</div></div>}
  </DashboardPage>;
}
function Stat({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-theme bg-theme-surface px-4 py-3"><p className="text-xs text-theme-muted">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-theme-primary">{value}</p></div>; }
