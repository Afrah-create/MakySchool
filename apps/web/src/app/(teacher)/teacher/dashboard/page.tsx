import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";

export default function TeacherDashboardPage() {
  return (
    <DashboardPage
      eyebrow="Teacher portal"
      title="Your dashboard"
      description="Class schedules, attendance, and learner progress will appear here."
      maxWidth="lg"
    >
      <div className="rounded-xl border border-dashed border-theme bg-theme-surface px-5 py-8 text-center">
        <p className="text-sm font-medium text-theme-primary">Coming soon</p>
        <p className="mt-1 text-sm text-theme-muted">
          Teacher workflows are being built in the teacher portal.
        </p>
      </div>
    </DashboardPage>
  );
}
