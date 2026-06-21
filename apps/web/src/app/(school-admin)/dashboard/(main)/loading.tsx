import { SkeletonPanel, SkeletonStatGrid, SkeletonTable } from "@makyschool/ui/components/ui/Skeleton";

export default function DashboardMainLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <SkeletonPanel className="min-h-[12rem]" />
      <SkeletonStatGrid count={3} layout="strip" />
      <section className="ms-card overflow-hidden">
        <div className="border-b border-theme px-5 py-4">
          <div className="h-4 w-32 animate-pulse rounded bg-theme-raised" />
          <div className="mt-2 h-3 w-48 animate-pulse rounded bg-theme-raised" />
        </div>
        <SkeletonTable rows={5} />
      </section>
    </div>
  );
}
