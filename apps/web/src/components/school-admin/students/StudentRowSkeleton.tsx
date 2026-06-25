import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";

export function StudentTableSkeleton({ rows = 8, embedded = false }: { rows?: number; embedded?: boolean }) {
  const shellClass = embedded
    ? "overflow-hidden"
    : "overflow-hidden rounded-xl border border-theme bg-theme-surface";

  return (
    <div className={shellClass}>
      <div className="border-b border-theme bg-table-header px-4 py-3">
        <Skeleton className="h-3 w-full max-w-md" />
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-4 border-t border-theme px-4 py-4"
        >
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-6 w-12 rounded-full" />
          <Skeleton className="hidden h-4 w-28 sm:block" />
          <Skeleton className="hidden h-4 w-16 md:block" />
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
