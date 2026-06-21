import type { ReactNode } from "react";
import { DashboardPageHeader } from "./DashboardPageHeader";

type DashboardPageProps = {
  children: ReactNode;
  header?: ReactNode;
  eyebrow?: string;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  maxWidth?: "lg" | "7xl";
};

const maxWidthClass = {
  lg: "max-w-lg",
  "7xl": "max-w-7xl",
} as const;

export function DashboardPage({
  children,
  header,
  eyebrow,
  title,
  description,
  actions,
  maxWidth = "7xl",
}: DashboardPageProps) {
  const resolvedHeader =
    header ??
    (title ? (
      <DashboardPageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={actions}
      />
    ) : null);

  return (
    <div className="flex min-h-0 flex-col">
      {resolvedHeader ? <div className="shrink-0">{resolvedHeader}</div> : null}

      <div
        className={`mx-auto w-full ${maxWidthClass[maxWidth]} px-4 py-6 sm:px-6 sm:py-6 lg:px-8`}
      >
        {children}
      </div>
    </div>
  );
}
