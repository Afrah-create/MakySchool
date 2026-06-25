"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { TeachingLoadMatrix } from "@makyschool/shared/types";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { QueryState } from "@makyschool/ui/components/ui/QueryState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import { ByClassView } from "@/components/school-admin/teaching-load/ByClassView";
import { BySubjectView } from "@/components/school-admin/teaching-load/BySubjectView";
import { ByTeacherView } from "@/components/school-admin/teaching-load/ByTeacherView";
import {
  TeachingLoadWorkspace,
  type TeachingLoadMode,
} from "@/components/school-admin/teaching-load/TeachingLoadWorkspace";
import { useSchoolSWR } from "@/hooks/useSchoolSWR";
import { useToast } from "@/providers/ToastProvider";

function parseMode(value: string | null): TeachingLoadMode {
  if (value === "by-class" || value === "by-subject") return value;
  return "by-teacher";
}

export function TeachingLoadManager() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const initialMode = parseMode(searchParams.get("mode"));
  const initialTeacherId = searchParams.get("teacherId");
  const initialClassId = searchParams.get("classId");
  const initialSubjectId = searchParams.get("subjectId");

  const [mode, setMode] = useState<TeachingLoadMode>(initialMode);

  const { data, error, isLoading, mutate } = useSchoolSWR<TeachingLoadMatrix>(
    "/schools/teaching-load",
  );

  const stats = useMemo(
    () =>
      data?.stats ?? {
        total_slots: 0,
        assigned: 0,
        unassigned: 0,
        teachers_without_load: 0,
      },
    [data?.stats],
  );

  function handleSaved() {
    toast.success("Teaching load saved.");
    void mutate();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-semibold text-theme-primary">Teaching load</h1>
        <p className="mt-1 text-sm text-theme-muted">
          Assign teachers to subjects in each class. Curriculum slots come from{" "}
          <span className="font-medium">Classes → Subject placement</span>.
        </p>
      </div>

      <QueryState
        isLoading={isLoading && !data}
        error={error}
        data={data}
        onRetry={() => void mutate()}
        loading={<Skeleton className="h-[32rem] w-full rounded-2xl" />}
        isEmpty={() => false}
      >
        {(matrix) => (
          <TeachingLoadWorkspace mode={mode} onModeChange={setMode} stats={stats}>
            {matrix.teachers.length === 0 ? (
              <EmptyState
                title="No teachers yet"
                description="Add teachers before assigning teaching load."
              />
            ) : mode === "by-teacher" ? (
              <ByTeacherView
                matrix={matrix}
                initialTeacherId={initialTeacherId}
                onSaved={handleSaved}
              />
            ) : mode === "by-class" ? (
              <ByClassView
                matrix={matrix}
                initialClassId={initialClassId}
                onSaved={handleSaved}
              />
            ) : (
              <BySubjectView
                matrix={matrix}
                initialSubjectId={initialSubjectId}
                onSaved={handleSaved}
              />
            )}
          </TeachingLoadWorkspace>
        )}
      </QueryState>
    </div>
  );
}
