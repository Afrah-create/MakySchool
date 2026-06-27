import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";

export default function LearnerDashboardPage() {
  return (
    <DashboardPage
      embedded
      eyebrow="Learner portal"
      title="Your dashboard"
      description="Timetable, assignments, and results will appear here."
      maxWidth="lg"
    >
      <div className="rounded-xl border border-dashed border-theme bg-theme-surface px-5 py-8 text-center">
        <p className="text-sm font-medium text-theme-primary">Learner portal</p>
        <p className="mt-1 text-sm text-theme-muted">
          Your timetable, assignments, and results will be available here soon.
        </p>
      </div>
    </DashboardPage>
  );
}
