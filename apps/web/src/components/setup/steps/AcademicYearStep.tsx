"use client";

export function AcademicYearStep({ value, onChange }: { value: any; onChange: (next: any) => void }) {
  return (
    <div className="space-y-4">
      <label className="block max-w-xs">
        <span className="mb-2 block text-sm font-medium text-slate-700">Current Year</span>
        <input type="number" value={value.year} onChange={(event) => onChange({ ...value, year: Number(event.target.value) })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
      </label>
      <div className="space-y-3">
        {value.terms.map((term: any, index: number) => (
          <div key={index} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
            <input value={term.name} onChange={(event) => onChange({ ...value, terms: value.terms.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, name: event.target.value } : item) })} placeholder={`Term ${index + 1} name`} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
            <input type="date" value={term.startDate} onChange={(event) => onChange({ ...value, terms: value.terms.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, startDate: event.target.value } : item) })} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
            <input type="date" value={term.endDate} onChange={(event) => onChange({ ...value, terms: value.terms.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, endDate: event.target.value } : item) })} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}