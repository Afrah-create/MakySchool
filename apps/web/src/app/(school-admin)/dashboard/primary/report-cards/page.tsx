'use client';

import { Suspense } from 'react';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { PrimaryReportCardsContent } from '@/components/school-admin/primary/PrimaryReportCardsContent';

export default function PrimaryReportCardsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl" />}>
      <PrimaryReportCardsContent />
    </Suspense>
  );
}
