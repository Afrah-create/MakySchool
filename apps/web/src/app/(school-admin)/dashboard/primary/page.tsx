'use client';

import { Suspense } from 'react';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { PrimaryOverviewContent } from '@/components/school-admin/primary/PrimaryOverviewContent';

export default function PrimaryOverviewPage() {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl" />}>
      <PrimaryOverviewContent />
    </Suspense>
  );
}
