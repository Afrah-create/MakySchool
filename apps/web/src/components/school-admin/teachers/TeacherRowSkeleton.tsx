export function TeacherRowSkeleton() {
  return (
    <div className="animate-pulse border-t border-theme px-4 py-4">
      <div className="flex items-center gap-4">
        <div className="h-9 w-9 rounded-full bg-theme-surface-raised" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-40 rounded bg-theme-surface-raised" />
          <div className="h-3 w-56 rounded bg-theme-surface-raised" />
        </div>
        <div className="hidden h-4 w-24 rounded bg-theme-surface-raised sm:block" />
        <div className="hidden h-6 w-20 rounded-full bg-theme-surface-raised md:block" />
        <div className="h-6 w-16 rounded-full bg-theme-surface-raised" />
        <div className="h-8 w-8 rounded bg-theme-surface-raised" />
      </div>
    </div>
  );
}

export function TeacherTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-theme bg-theme-surface">
      <div className="bg-table-header px-4 py-3">
        <div className="h-3 w-48 animate-pulse rounded bg-theme-surface-raised" />
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <TeacherRowSkeleton key={index} />
      ))}
    </div>
  );
}
