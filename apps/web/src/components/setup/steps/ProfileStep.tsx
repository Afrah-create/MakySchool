"use client";

import { FileUpload } from "@/components/ui/FileUpload";

export function ProfileStep({ value, onChange }: { value: any; onChange: (next: any) => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <label className="block lg:col-span-2">
        <span className="mb-2 block text-sm font-medium text-slate-700">School Name</span>
        <input value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
      </label>
      <FileUpload label="Logo" helperText="PNG or JPG, max 2 MB." onChange={(file) => onChange({ ...value, logo: file })} />
      <FileUpload label="Stamp" helperText="PNG or JPG, max 2 MB." onChange={(file) => onChange({ ...value, stamp: file })} />
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">Email</span>
        <input value={value.email} onChange={(event) => onChange({ ...value, email: event.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">Phone</span>
        <input value={value.phone} onChange={(event) => onChange({ ...value, phone: event.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
      </label>
      <label className="block lg:col-span-2">
        <span className="mb-2 block text-sm font-medium text-slate-700">Address</span>
        <textarea value={value.address} onChange={(event) => onChange({ ...value, address: event.target.value })} rows={3} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
      </label>
      <div className="lg:col-span-2">
        <p className="mb-2 block text-sm font-medium text-slate-700">School Type</p>
        <div className="flex flex-wrap gap-3">
          {[("primary"), ("secondary"), ("both")].map((type) => (
            <label key={type} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700">
              <input type="radio" name="schoolType" checked={value.schoolType === type} onChange={() => onChange({ ...value, schoolType: type })} />
              {type}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}