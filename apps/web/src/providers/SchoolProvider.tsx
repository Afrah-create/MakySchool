"use client";

import { createContext, useContext } from "react";
import type { SchoolRecord, SetupStatusResponse } from "@makyschool/shared/types";

type SchoolContextValue = {
  schoolSlug: string;
  school: SchoolRecord | null;
  setupStatus: SetupStatusResponse | null;
};

const SchoolContext = createContext<SchoolContextValue | null>(null);

export function SchoolProvider({
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
    <SchoolContext.Provider value={{ schoolSlug, school, setupStatus }}>
      {children}
    </SchoolContext.Provider>
  );
}

export function useSchool() {
  const context = useContext(SchoolContext);
  if (!context) {
    throw new Error("useSchool must be used within SchoolProvider");
  }
  return context;
}

/** @deprecated Use useSchool */
export const useTenantSchool = useSchool;

/** @deprecated Use SchoolProvider */
export const TenantSchoolProvider = SchoolProvider;
