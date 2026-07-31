'use client';

import { Suspense, use } from 'react';
import { Skeleton } from '@makyschool/ui/components/ui/Skeleton';
import { PrimaryStudentResultContent } from '@/components/school-admin/primary/PrimaryStudentResultContent';

function StudentResultInner({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = use(params);
  return <PrimaryStudentResultContent studentId={studentId} />;
}

export default function PrimaryStudentResultPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl" />}>
      <StudentResultInner params={params} />
    </Suspense>
  );
}
