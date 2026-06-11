"use client";

export function GradingScaleStep({ value, onChange }: { value: any; onChange: (next: any) => void }) {
  return (
    <div className="space-y-4">
      {value.bands.map((band: any, index: number) => (
        <div key={index} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-4">
          <input value={band.label} onChange={(event) => onChange({ ...value, bands: value.bands.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, label: event.target.value } : item) })} placeholder="Label" className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
          <input type="number" value={band.minScore} onChange={(event) => onChange({ ...value, bands: value.bands.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, minScore: Number(event.target.value) } : item) })} placeholder="Min" className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
          <input type="number" value={band.maxScore} onChange={(event) => onChange({ ...value, bands: value.bands.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, maxScore: Number(event.target.value) } : item) })} placeholder="Max" className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
          <input value={band.description} onChange={(event) => onChange({ ...value, bands: value.bands.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, description: event.target.value } : item) })} placeholder="Description" className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
        </div>
      ))}
      <button type="button" onClick={() => onChange({ ...value, bands: [...value.bands, { label: "", minScore: 0, maxScore: 0, description: "" }] })} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
        Add Band
      </button>
    </div>
  );
}