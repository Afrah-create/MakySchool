'use client';

import { use } from 'react';
import { TeacherAttendanceDetailContent } from '@/components/school-admin/teacher-attendance/TeacherAttendanceDetailContent';

export default function TeacherAttendanceDetailPage({
  params,
}: {
  params: Promise<{ teacherId: string }>;
}) {
  const { teacherId } = use(params);
  return <TeacherAttendanceDetailContent teacherId={teacherId} />;
}
