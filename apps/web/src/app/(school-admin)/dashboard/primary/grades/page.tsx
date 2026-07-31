'use client';

import { Suspense } from 'react';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { PrimaryGradesContent } from '@/components/school-admin/primary/PrimaryGradesContent';

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl" />}>
      <PrimaryGradesContent portal="admin" />
    </Suspense>
  );
}
