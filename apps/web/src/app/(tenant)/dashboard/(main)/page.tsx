import { SubscriptionBanner } from "@/components/tenant/SubscriptionBanner";
import { DashboardStats } from "@/components/tenant/DashboardStats";

export default function DashboardPage() {
  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <SubscriptionBanner />
        <DashboardStats />
      </div>
    </main>
  );
}
