'use client';

import { Suspense } from 'react';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { PrimarySetupContent } from '@/components/school-admin/primary/PrimarySetupContent';

export default function PrimarySetupPage() {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl" />}>
      <PrimarySetupContent />
    </Suspense>
  );
}
