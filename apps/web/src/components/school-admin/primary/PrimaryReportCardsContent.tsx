"use client";

import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { schoolOffersPrimary } from "@makyschool/shared";
import { useSchool } from "@/providers/SchoolProvider";
import { useToast } from "@/providers/ToastProvider";
import { useCurrentTerm } from "@/hooks/useCurrentTerm";
import { usePrimaryClasses, usePrimaryRoster } from "@/hooks/usePrimary";
import { primaryApi } from "@/lib/api/primary";

export function PrimaryReportCardsContent() {
  const { school } = useSchool();
  const offers = schoolOffersPrimary(school?.school_type);
  const { toast } = useToast();
  const { data: term } = useCurrentTerm();
  const { data: classes = [] } = usePrimaryClasses(offers);
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!classId && classes[0]) setClassId(classes[0].id);
  }, [classes, classId]);

  const { data: roster = [] } = usePrimaryRoster(classId, offers && !!classId);

  if (!offers) {
    return (
      <DashboardPage embedded maxWidth="7xl" title="Report cards">
        <EmptyState
          title="Primary not enabled"
          description="Not available for secondary-only schools."
        />
      </DashboardPage>
    );
  }

  async function download(all: boolean) {
    if (!classId || !term?.id) {
      toast.error("Select a class and ensure a current term is set.");
      return;
    }
    setBusy(true);
    try {
      const result = await primaryApi.generateReportCards({
        classId,
        termId: term.id,
        studentId: all ? undefined : studentId || undefined,
      });
      toast.success(`Downloaded ${result.filename}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardPage
      embedded
      maxWidth="5xl"
      eyebrow="Primary"
      title="Report cards"
      description="Generate PDF report cards for a class or a single learner."
    >
      <div className="space-y-4 rounded-xl border border-theme bg-theme-surface p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase text-theme-muted">
              Class
            </span>
            <select
              className="ms-input w-full"
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setStudentId("");
              }}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase text-theme-muted">
              Single learner (optional)
            </span>
            <select
              className="ms-input w-full"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            >
              <option value="">Entire class (ZIP)</option>
              {roster.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <LoadingButton
            loading={busy}
            onClick={() => void download(false)}
            className="inline-flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            {studentId ? "Download PDF" : "Download class ZIP"}
          </LoadingButton>
        </div>

        {!classes.length ? (
          <EmptyState
            icon={FileText}
            title="No primary classes"
            description="Create P1–P7 classes before generating report cards."
          />
        ) : null}
      </div>
    </DashboardPage>
  );
}
