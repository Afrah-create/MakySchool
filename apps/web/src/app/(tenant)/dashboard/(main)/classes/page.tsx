import { ClassesManager } from "@/components/tenant/ClassesManager";
import { TenantSchoolGate } from "@/components/tenant/TenantSchoolGate";

export default function ClassesPage() {
  return (
    <TenantSchoolGate>
      {(school, schoolSlug) => (
        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl space-y-6">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.28em] text-slate-500">
                Academic Structure
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900">Classes & Subjects</h1>
            </div>
            <ClassesManager schoolType={school.school_type} schoolSlug={schoolSlug} />
          </div>
        </main>
      )}
    </TenantSchoolGate>
  );
}
