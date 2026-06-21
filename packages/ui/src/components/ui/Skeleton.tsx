import { cn } from "../../lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-xl bg-theme-raised motion-reduce:animate-none motion-reduce:opacity-70",
        className,
      )}
    />
  );
}

export function SkeletonStatCard({ className }: { className?: string }) {
  return (
    <div className={cn("ms-card flex w-56 shrink-0 flex-col justify-between p-5", className)}>
      <Skeleton className="h-10 w-10 rounded-xl" />
      <div className="mt-6 space-y-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
}

export function SkeletonStatGrid({
  count = 3,
  layout = "strip",
}: {
  count?: number;
  layout?: "strip" | "grid";
}) {
  if (layout === "grid") {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-1">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonStatCard key={index} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-5">
      <Skeleton className="h-8 w-full rounded-lg" />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function SkeletonPanel({ className }: { className?: string }) {
  return (
    <div className={cn("ms-panel space-y-4 p-5 sm:p-6", className)}>
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-4 w-full max-w-md" />
      <SkeletonList rows={3} />
    </div>
  );
}

export function SkeletonAttentionList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}
