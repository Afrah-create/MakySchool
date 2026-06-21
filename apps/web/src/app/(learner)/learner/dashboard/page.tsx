import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";

export default function LearnerDashboardPage() {
  return (
    <DashboardPage
      eyebrow="Learner portal"
      title="Your dashboard"
      description="Timetable, assignments, and results will appear here."
      maxWidth="lg"
    >
      <div className="rounded-xl border border-dashed border-theme bg-theme-surface px-5 py-8 text-center">
        <p className="text-sm font-medium text-theme-primary">Coming soon</p>
        <p className="mt-1 text-sm text-theme-muted">
          Learner workflows are being built in the learner portal.
        </p>
      </div>
    </DashboardPage>
  );
}
