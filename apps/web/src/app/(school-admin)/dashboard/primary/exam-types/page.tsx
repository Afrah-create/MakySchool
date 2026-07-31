'use client';

import { Suspense } from 'react';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { PrimaryExamTypesContent } from '@/components/school-admin/primary/PrimaryExamTypesContent';

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl" />}>
      <PrimaryExamTypesContent />
    </Suspense>
  );
}
