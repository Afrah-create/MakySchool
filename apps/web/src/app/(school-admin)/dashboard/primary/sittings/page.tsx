'use client';

import { Suspense } from 'react';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { PrimarySittingsContent } from '@/components/school-admin/primary/PrimarySittingsContent';

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl" />}>
      <PrimarySittingsContent />
    </Suspense>
  );
}
