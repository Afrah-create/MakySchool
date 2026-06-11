export function ReviewStep({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-slate-900">School Profile</h3>
        <p className="mt-2 text-sm text-slate-600">{data.profile.name || "Unnamed"}</p>
        <p className="text-sm text-slate-600">{data.profile.email || "No email"}</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-slate-900">Academic Year</h3>
        <p className="mt-2 text-sm text-slate-600">{data.academicYear.year}</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-slate-900">Grading Scale</h3>
        <p className="mt-2 text-sm text-slate-600">{data.gradingScale.bands.length} bands configured</p>
      </div>
    </div>
  );
}