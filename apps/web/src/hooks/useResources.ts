"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  resourcesApi,
  type SubjectResourceListParams,
  type TeachingPlanListParams,
} from "@/lib/api/resources";

export const resourceKeys = {
  teachingPlans: (filters: string) => ["teaching-plans", filters] as const,
  compliance: (termId: string) => ["teaching-plans", "compliance", termId] as const,
  subjectResources: (filters: string) => ["subject-resources", filters] as const,
};

export function useResourceTerms(enabled = true) {
  return useQuery({
    queryKey: ["resources", "terms"] as const,
    queryFn: () => resourcesApi.listTerms(),
    enabled,
    staleTime: 60_000,
  });
}

export function useTeachingPlans(params: TeachingPlanListParams, enabled = true) {
  const key = JSON.stringify(params);
  return useQuery({
    queryKey: resourceKeys.teachingPlans(key),
    queryFn: () => resourcesApi.listTeachingPlans(params),
    enabled,
    staleTime: 30_000,
  });
}

export function useTeachingPlanCompliance(termId: string, enabled = true) {
  return useQuery({
    queryKey: resourceKeys.compliance(termId),
    queryFn: () => resourcesApi.teachingPlanCompliance(termId),
    enabled: enabled && !!termId,
    staleTime: 30_000,
  });
}

export function useSubjectResources(params: SubjectResourceListParams, enabled = true) {
  const key = JSON.stringify(params);
  return useQuery({
    queryKey: resourceKeys.subjectResources(key),
    queryFn: () => resourcesApi.listSubjectResources(params),
    enabled,
    staleTime: 30_000,
  });
}

export function useInvalidateResources() {
  const qc = useQueryClient();
  return {
    invalidatePlans: () =>
      qc.invalidateQueries({ queryKey: ["teaching-plans"] }),
    invalidateSubjectResources: () =>
      qc.invalidateQueries({ queryKey: ["subject-resources"] }),
  };
}

export function useDeleteTeachingPlan() {
  const { invalidatePlans } = useInvalidateResources();
  return useMutation({
    mutationFn: (id: string) => resourcesApi.deleteTeachingPlan(id),
    onSuccess: () => invalidatePlans(),
  });
}

export function useDeleteSubjectResource() {
  const { invalidateSubjectResources } = useInvalidateResources();
  return useMutation({
    mutationFn: (id: string) => resourcesApi.deleteSubjectResource(id),
    onSuccess: () => invalidateSubjectResources(),
  });
}

export function useSetResourceVisibility() {
  const { invalidateSubjectResources } = useInvalidateResources();
  return useMutation({
    mutationFn: ({ id, isPublished }: { id: string; isPublished: boolean }) =>
      resourcesApi.setVisibility(id, isPublished),
    onSuccess: () => invalidateSubjectResources(),
  });
}
