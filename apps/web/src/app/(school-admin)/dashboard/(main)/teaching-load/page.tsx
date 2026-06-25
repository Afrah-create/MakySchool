import { Suspense } from "react";
import { TeachingLoadManager } from "@/components/school-admin/teaching-load/TeachingLoadManager";
import { Skeleton } from "@makyschool/ui/components/ui/Skeleton";

export default function TeachingLoadPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-6 h-96 max-w-7xl rounded-2xl" />}>
      <TeachingLoadManager />
    </Suspense>
  );
}
