import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";

export default function LearnerTimetablePage() {
  return (
    <DashboardPage
      embedded
      eyebrow="Learner portal"
      title="Timetable"
      description="Your weekly class schedule will appear here."
      maxWidth="lg"
    >
      <div className="rounded-xl border border-dashed border-theme bg-theme-surface px-5 py-8 text-center">
        <p className="text-sm font-medium text-theme-primary">Coming soon</p>
      </div>
    </DashboardPage>
  );
}
