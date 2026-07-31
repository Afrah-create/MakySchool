"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { LoadingButton } from "@makyschool/ui/components/ui/LoadingButton";
import { isUpperPrimaryLevel, schoolOffersPrimary } from "@makyschool/shared";
import { useSchool } from "@/providers/SchoolProvider";
import { useToast } from "@/providers/ToastProvider";
import { useCurrentTerm } from "@/hooks/useCurrentTerm";
import { usePrimaryClasses } from "@/hooks/usePrimary";
import { primaryApi } from "@/lib/api/primary";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export function PrimaryExamsContent() {
  const { school } = useSchool();
  const offers = schoolOffersPrimary(school?.school_type);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: term } = useCurrentTerm();
  const { data: classes = [] } = usePrimaryClasses(offers);
  const upper = useMemo(
    () => classes.filter((c) => isUpperPrimaryLevel(c.level)),
    [classes],
  );
  const [classId, setClassId] = useState("");
  const [examTypeId, setExamTypeId] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!classId && upper[0]) setClassId(upper[0].id);
  }, [upper, classId]);

  const { data: examTypes = [] } = useQuery({
    queryKey: ["primary", "exam-types"],
    queryFn: () => primaryApi.listExamTypes(),
    enabled: offers,
  });

  useEffect(() => {
    if (!examTypeId && examTypes[0]) setExamTypeId(examTypes[0].id);
  }, [examTypes, examTypeId]);

  const { data: exams = [], isPending } = useQuery({
    queryKey: ["primary", "exams", classId, term?.id],
    queryFn: () =>
      primaryApi.listExams({
        classId: classId || undefined,
        termId: term?.id,
      }),
    enabled: offers && !!classId && !!term?.id,
  });

  if (!offers) {
    return (
      <DashboardPage embedded maxWidth="7xl" title="Primary exams">
        <EmptyState title="Primary not enabled" description="Not available for secondary-only schools." />
      </DashboardPage>
    );
  }

  async function createExam() {
    if (!classId || !term?.id || !examTypeId) {
      toast.error("Select class, term, and exam type.");
      return;
    }
    setCreating(true);
    try {
      await primaryApi.createExam({
        classId,
        termId: term.id,
        examTypeId,
        openNow: true,
      });
      toast.success("Exam created and opened for teachers.");
      await qc.invalidateQueries({ queryKey: ["primary", "exams"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setCreating(false);
    }
  }

  async function setStatus(examId: string, action: "open" | "close") {
    setBusyId(examId);
    try {
      if (action === "open") await primaryApi.openExam(examId);
      else await primaryApi.closeExam(examId);
      toast.success(action === "open" ? "Exam opened." : "Exam closed.");
      await qc.invalidateQueries({ queryKey: ["primary", "exams"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <DashboardPage
      embedded
      maxWidth="7xl"
      eyebrow="Primary"
      title="Exams"
      description="Create an exam for a P4–P7 class. Teachers enter marks for subjects they teach; you unlock if they need to re-enter."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3 rounded-xl border border-theme bg-theme-surface p-4">
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase text-theme-muted">Class</span>
            <select className="ms-input" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {upper.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase text-theme-muted">Exam type</span>
            <select
              className="ms-input"
              value={examTypeId}
              onChange={(e) => setExamTypeId(e.target.value)}
            >
              {examTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <LoadingButton loading={creating} onClick={() => void createExam()}>
              Create & open
            </LoadingButton>
          </div>
        </div>

        {!term?.id ? (
          <EmptyState title="No current term" description="Set a current term in academic settings." />
        ) : isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : !exams.length ? (
          <EmptyState title="No exams yet" description="Create an exam for this class and term." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-theme">
            <table className="min-w-full text-sm">
              <thead className="bg-theme-raised/50 text-[11px] uppercase text-theme-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Exam</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme">
                {exams.map((e) => (
                  <tr key={e.id}>
                    <td className="px-3 py-2 font-medium">{e.name}</td>
                    <td className="px-3 py-2">{e.examTypeName}</td>
                    <td className="px-3 py-2 capitalize">{e.status}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/dashboard/primary/grades?examId=${e.id}`}
                          className="ms-btn-secondary text-xs"
                        >
                          View grades
                        </Link>
                        {e.status !== "open" ? (
                          <LoadingButton
                            loading={busyId === e.id}
                            className="text-xs"
                            onClick={() => void setStatus(e.id, "open")}
                          >
                            Open
                          </LoadingButton>
                        ) : (
                          <LoadingButton
                            loading={busyId === e.id}
                            className="text-xs"
                            onClick={() => void setStatus(e.id, "close")}
                          >
                            Close
                          </LoadingButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardPage>
  );
}
