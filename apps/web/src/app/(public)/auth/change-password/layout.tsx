import { SessionManager } from "@/components/session/SessionManager";

export default function ChangePasswordLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SessionManager />
      {children}
    </>
  );
}
