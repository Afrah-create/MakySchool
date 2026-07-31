'use client';

import { Suspense } from 'react';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { PrimaryResultsContent } from '@/components/school-admin/primary/PrimaryResultsContent';

export default function PrimaryResultsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl" />}>
      <PrimaryResultsContent />
    </Suspense>
  );
}
