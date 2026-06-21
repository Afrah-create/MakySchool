import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";

export default function TeacherClassesPage() {
  return (
    <DashboardPage
      eyebrow="Teacher portal"
      title="My classes"
      description="Assigned classes and streams will be listed here."
      maxWidth="lg"
    >
      <div className="rounded-xl border border-dashed border-theme bg-theme-surface px-5 py-8 text-center">
        <p className="text-sm font-medium text-theme-primary">Coming soon</p>
      </div>
    </DashboardPage>
  );
}
