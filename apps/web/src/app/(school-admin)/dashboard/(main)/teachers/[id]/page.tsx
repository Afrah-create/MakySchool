import { TeacherDetailContent } from "@/components/school-admin/teachers/TeacherDetailContent";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function TeacherDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <TeacherDetailContent teacherId={id} />;
}
