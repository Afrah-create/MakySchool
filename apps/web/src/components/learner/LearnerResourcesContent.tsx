"use client";

import { useMemo, useState } from "react";
import { BookOpen, Download, Eye, Play } from "lucide-react";
import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";
import type { SubjectResource } from "@makyschool/shared";
import { useToast } from "@/providers/ToastProvider";
import { useSubjectResources } from "@/hooks/useResources";
import { resourcesApi } from "@/lib/api/resources";
import { formatBytes, formatShortDate } from "@/lib/resources/format";
import { ResourceTypeIcon } from "@/components/resources/ResourceTypeIcon";

export function LearnerResourcesContent() {
  const { toast } = useToast();
  const { data: resources = [], isPending, isError, refetch } = useSubjectResources({});
  const [videoResource, setVideoResource] = useState<SubjectResource | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);

  const bySubject = useMemo(() => {
    const map = new Map<string, { name: string; items: SubjectResource[] }>();
    for (const r of resources) {
      const key = r.subjectId;
      const existing = map.get(key);
      if (existing) {
        existing.items.push(r);
      } else {
        map.set(key, { name: r.subjectName || "Subject", items: [r] });
      }
    }
    return Array.from(map.values());
  }, [resources]);

  async function openDownload(resource: SubjectResource, asDownload = false) {
    try {
      const { url, fileName } = await resourcesApi.downloadSubjectResource(resource.id);
      if (asDownload) {
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.rel = "noopener";
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open resource.");
    }
  }

  async function openVideo(resource: SubjectResource) {
    setLoadingVideo(true);
    setVideoResource(resource);
    try {
      const { url } = await resourcesApi.downloadSubjectResource(resource.id);
      setVideoUrl(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load video.");
      setVideoResource(null);
      setVideoUrl(null);
    } finally {
      setLoadingVideo(false);
    }
  }

  function closeVideo() {
    setVideoResource(null);
    setVideoUrl(null);
  }

  return (
    <DashboardPage
      embedded
      maxWidth="7xl"
      eyebrow="Learner portal"
      title="Learning resources"
      description="Materials shared by your teachers for your class."
    >
      <div className="space-y-8">
        {isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : isError ? (
          <EmptyState
            icon={BookOpen}
            title="Could not load resources"
            description="Please try again."
            action={
              <button type="button" className="ms-btn-secondary" onClick={() => void refetch()}>
                Retry
              </button>
            }
          />
        ) : resources.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No resources yet"
            description="When your teachers publish materials, they will appear here."
          />
        ) : (
          bySubject.map((group) => (
            <section key={group.name}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-theme-muted">
                {group.name}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((resource) => (
                  <article
                    key={resource.id}
                    className="flex flex-col rounded-xl border border-theme bg-theme-surface p-4"
                  >
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-theme-raised text-theme-muted">
                      <ResourceTypeIcon type={resource.resourceType} className="h-6 w-6" />
                    </div>
                    <h3 className="font-semibold text-theme-primary">{resource.title}</h3>
                    {resource.description ? (
                      <p className="mt-1 line-clamp-3 text-sm text-theme-muted">
                        {resource.description}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-theme-faint">
                      {resource.teacherName} · {formatBytes(resource.fileSize)} ·{" "}
                      {formatShortDate(resource.uploadedAt ?? resource.publishedAt)}
                    </p>
                    <div className="mt-auto flex flex-wrap gap-2 pt-4">
                      {resource.resourceType === "video" ? (
                        <button
                          type="button"
                          className="ms-btn-primary inline-flex items-center gap-1.5 text-xs"
                          onClick={() => void openVideo(resource)}
                        >
                          <Play className="h-3.5 w-3.5" />
                          Watch
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="ms-btn-primary inline-flex items-center gap-1.5 text-xs"
                          onClick={() => void openDownload(resource, false)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </button>
                      )}
                      <button
                        type="button"
                        className="ms-btn-secondary inline-flex items-center gap-1.5 text-xs"
                        onClick={() => void openDownload(resource, true)}
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {videoResource ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close video"
            className="absolute inset-0 bg-theme-overlay backdrop-blur-sm"
            onClick={closeVideo}
          />
          <div className="relative z-10 w-full max-w-3xl overflow-hidden rounded-2xl border border-theme bg-theme-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-theme px-4 py-3">
              <h3 className="truncate pr-4 text-sm font-semibold text-theme-primary">
                {videoResource.title}
              </h3>
              <button type="button" className="ms-btn-secondary text-xs" onClick={closeVideo}>
                Close
              </button>
            </div>
            <div className="bg-black p-2 sm:p-4">
              {loadingVideo || !videoUrl ? (
                <div className="flex h-48 items-center justify-center text-sm text-white/70">
                  Loading video…
                </div>
              ) : (
                <video
                  key={videoUrl}
                  src={videoUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="mx-auto max-h-[70vh] w-full"
                >
                  Your browser does not support video playback.
                </video>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </DashboardPage>
  );
}
