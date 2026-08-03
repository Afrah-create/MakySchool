'use client';

import { Suspense } from 'react';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { PrimaryThematicContent } from '@/components/school-admin/primary/PrimaryThematicContent';

export default function PrimaryThematicPage() {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl" />}>
      <PrimaryThematicContent portal="admin" />
    </Suspense>
  );
}
