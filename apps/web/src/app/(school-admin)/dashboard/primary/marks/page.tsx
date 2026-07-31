'use client';

import { Suspense } from 'react';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { PrimaryMarksContent } from '@/components/school-admin/primary/PrimaryMarksContent';

export default function PrimaryMarksPage() {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl" />}>
      <PrimaryMarksContent />
    </Suspense>
  );
}
