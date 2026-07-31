'use client';

import { Suspense } from 'react';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { PrimaryExamsContent } from '@/components/school-admin/primary/PrimaryExamsContent';

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl" />}>
      <PrimaryExamsContent />
    </Suspense>
  );
}
