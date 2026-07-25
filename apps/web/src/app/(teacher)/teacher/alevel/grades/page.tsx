'use client';

import { Suspense } from 'react';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import ALevelGradesClient from '@/app/(school-admin)/dashboard/alevel/grades/GradesClient';

function TeacherGradesFallback() {
  return (
    <div className="mx-auto max-w-full space-y-6 p-4 sm:p-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}

export default function TeacherALevelGradesPage() {
  return (
    <Suspense fallback={<TeacherGradesFallback />}>
      <ALevelGradesClient portal="teacher" />
    </Suspense>
  );
}
