"use client";

import { SWRConfig } from "swr";
import { AuthProvider } from "@/providers/AuthProvider";
import { ThemeProvider } from "@makyschool/ui/providers/ThemeProvider";
import { swrConfig } from "@/lib/swr/config";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SWRConfig value={swrConfig}>
        <AuthProvider>{children}</AuthProvider>
      </SWRConfig>
    </ThemeProvider>
  );
}
