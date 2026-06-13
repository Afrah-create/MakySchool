"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ProgressBar } from "@/components/ui/ProgressBar";

export function DashboardNavProgress() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(true);
    const timer = window.setTimeout(() => setActive(false), 600);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  if (!active) {
    return null;
  }

  return <ProgressBar indeterminate className="absolute inset-x-0 top-0 z-10" />;
}
