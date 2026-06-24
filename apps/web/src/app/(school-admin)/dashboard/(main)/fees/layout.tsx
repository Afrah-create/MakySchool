import { FeesSubNav } from "@/components/fees/FeesSubNav";

export default function AdminFeesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <FeesSubNav />
      {children}
    </div>
  );
}
