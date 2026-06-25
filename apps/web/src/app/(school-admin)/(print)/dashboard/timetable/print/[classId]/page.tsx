import { TimetablePrintView } from "@/components/timetable/TimetablePrintView";

type PrintPageProps = {
  params: Promise<{ classId: string }>;
};

export default async function TimetablePrintPage({ params }: PrintPageProps) {
  const { classId } = await params;
  return <TimetablePrintView classId={classId} />;
}
