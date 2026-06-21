"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ProgressBar } from "@makyschool/ui/components/ui/ProgressBar";

export function DashboardNavProgress() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);

  useEffect(() => {
    const showTimer = window.setTimeout(() => setActive(true), 0);
    const hideTimer = window.setTimeout(() => setActive(false), 600);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [pathname]);

  if (!active) {
    return null;
  }

  return <ProgressBar indeterminate className="absolute inset-x-0 top-0 z-10" />;
}
