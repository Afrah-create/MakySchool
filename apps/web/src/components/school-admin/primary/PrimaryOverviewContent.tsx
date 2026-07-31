"use client";

import Link from "next/link";
import { BookOpen, ClipboardList, FileText, GraduationCap, Settings2 } from "lucide-react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { schoolOffersPrimary } from "@makyschool/shared";
import { useSchool } from "@/providers/SchoolProvider";
import { useToast } from "@/providers/ToastProvider";
import { useCurrentTerm } from "@/hooks/useCurrentTerm";
import { useEnsurePrimarySetup, usePrimaryOverview, usePrimarySetup } from "@/hooks/usePrimary";

const LINKS = [
  { href: "/dashboard/primary/marks", label: "Marks entry", icon: ClipboardList },
  { href: "/dashboard/primary/results", label: "Results", icon: FileText },
  { href: "/dashboard/primary/report-cards", label: "Report cards", icon: BookOpen },
  { href: "/dashboard/primary/ple", label: "PLE results", icon: GraduationCap },
  { href: "/dashboard/primary/setup", label: "Setup", icon: Settings2 },
];

export function PrimaryOverviewContent() {
  const { school } = useSchool();
  const { toast } = useToast();
  const offers = schoolOffersPrimary(school?.school_type);
  const { data: term } = useCurrentTerm();
  const { data: overview, isPending, refetch } = usePrimaryOverview(
    term?.id,
    offers,
  );
  const { data: setup } = usePrimarySetup(offers);
  const ensureSetup = useEnsurePrimarySetup();

  if (!offers) {
    return (
      <DashboardPage embedded maxWidth="7xl" title="Primary reports" eyebrow="Academic">
        <EmptyState
          icon={BookOpen}
          title="Primary not enabled"
          description="This school is set up as secondary only. Change school type to Primary or Both in settings to use primary reports."
        />
      </DashboardPage>
    );
  }

  async function handleSetup() {
    try {
      await ensureSetup.mutateAsync({});
      toast.success("Primary module set up with default Ugandan scale and subjects.");
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Setup failed.");
    }
  }

  return (
    <DashboardPage
      embedded
      maxWidth="7xl"
      eyebrow="Academic"
      title="Primary reports"
      description={
        term?.name
          ? `P1–P7 assessment and report cards · ${term.name}`
          : "P1–P7 assessment and report cards"
      }
    >
      <div className="space-y-6">
        {isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : !overview?.configured && !setup ? (
          <EmptyState
            icon={Settings2}
            title="Primary report module is not set up"
            description="Create the grading system, default D/C/P/F scale, subjects, and themes."
            action={
              <LoadingButton loading={ensureSetup.isPending} onClick={() => void handleSetup()}>
                Set up now
              </LoadingButton>
            }
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Primary students" value={overview?.primaryStudents ?? 0} />
              <Stat
                label="Submitted subject slots"
                value={overview?.submittedSubjectSlots ?? 0}
              />
              <Stat label="Reports generated" value={overview?.reportsGenerated ?? 0} />
              <Stat label="P7 students" value={overview?.p7Students ?? 0} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {LINKS.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center gap-3 rounded-xl border border-theme bg-theme-surface p-4 transition hover:border-theme-accent"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-theme-raised text-theme-muted">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="font-medium text-theme-primary">{link.label}</span>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </DashboardPage>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-theme bg-theme-surface px-4 py-3">
      <p className="text-xs text-theme-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-theme-primary">{value}</p>
    </div>
  );
}
