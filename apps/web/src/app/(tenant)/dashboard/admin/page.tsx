import { DashboardPage } from "@/components/layout/DashboardPage";

export default function AdminSetupPage() {
  return (
    <DashboardPage
      eyebrow="Configuration"
      title="School profile & setup"
      description="Logo, stamp, academic year, terms, and grading scale are managed during the initial setup wizard."
      maxWidth="lg"
    >
      <div className="rounded-xl border border-dashed border-theme bg-theme-surface px-5 py-8 text-center">
        <p className="text-sm font-medium text-theme-primary">Coming soon</p>
        <p className="mt-1 text-sm text-theme-muted">
          Return to the dashboard to manage classes and subjects.
        </p>
      </div>
    </DashboardPage>
  );
}
