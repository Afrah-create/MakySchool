"use client";

import { ThemeProvider } from "@/providers/ThemeProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
