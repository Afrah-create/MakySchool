'use client';

import { Suspense } from 'react';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { PrimaryGradesContent } from '@/components/school-admin/primary/PrimaryGradesContent';

export default function TeacherPrimaryGradesPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-full space-y-6 p-4 sm:p-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      }
    >
      <PrimaryGradesContent portal="teacher" />
    </Suspense>
  );
}
