import { EmptyState } from "@makyschool/ui/components/ui/EmptyState";

export function AcademicEmpty({ title, description }: { title: string; description: string }) {
  return <EmptyState variant="compact" icon={null} title={title} description={description} />;
}
