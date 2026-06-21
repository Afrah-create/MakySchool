import { DashboardPage } from "@makyschool/ui/components/layout/DashboardPage";
import { SubscriptionAuditsPanel } from "@/components/subscriptions/SubscriptionAuditsPanel";

export default function SubscriptionsPage() {
  return (
    <DashboardPage
      title="Subscription audits"
      description="Track term rollovers and require payment when a new term begins"
    >
      <SubscriptionAuditsPanel />
    </DashboardPage>
  );
}
