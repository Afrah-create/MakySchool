'use client';

import { Suspense } from 'react';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { PrimaryPleContent } from '@/components/school-admin/primary/PrimaryPleContent';

export default function PrimaryPlePage() {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl" />}>
      <PrimaryPleContent />
    </Suspense>
  );
}
