import { SkeletonStatGrid, SkeletonTable } from "@makyschool/ui/components/ui/Skeleton";

export default function ClassesPageLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 space-y-2">
        <div className="h-3 w-24 animate-pulse rounded bg-theme-raised" />
        <div className="h-8 w-64 animate-pulse rounded bg-theme-raised" />
        <div className="h-4 w-full max-w-lg animate-pulse rounded bg-theme-raised" />
      </div>
      <div className="space-y-6">
        <SkeletonStatGrid count={4} layout="grid" />
        <div className="h-11 w-full max-w-md animate-pulse rounded-xl bg-theme-raised" />
        <section className="ms-card overflow-hidden">
          <div className="border-b border-theme px-5 py-4">
            <div className="h-9 w-full max-w-sm animate-pulse rounded-lg bg-theme-raised" />
          </div>
          <SkeletonTable rows={8} />
        </section>
      </div>
    </div>
  );
}
