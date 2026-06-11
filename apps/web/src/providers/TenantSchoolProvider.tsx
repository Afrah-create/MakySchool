"use client";

import { createContext, useContext } from "react";
import type { SchoolRecord, SetupStatusResponse } from "@makyschool/shared/types";

type TenantSchoolContextValue = {
  schoolSlug: string;
  school: SchoolRecord | null;
  setupStatus: SetupStatusResponse | null;
};

const TenantSchoolContext = createContext<TenantSchoolContextValue | null>(null);

export function TenantSchoolProvider({
  children,
  schoolSlug,
  school,
  setupStatus,
}: {
  children: React.ReactNode;
  schoolSlug: string;
  school: SchoolRecord | null;
  setupStatus: SetupStatusResponse | null;
}) {
  return (
    <TenantSchoolContext.Provider value={{ schoolSlug, school, setupStatus }}>
      {children}
    </TenantSchoolContext.Provider>
  );
}

export function useTenantSchool() {
  const context = useContext(TenantSchoolContext);
  if (!context) {
    throw new Error("useTenantSchool must be used within TenantSchoolProvider");
  }
  return context;
}
