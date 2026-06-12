type ReviewData = {
  profile: {
    name: string;
    email: string;
    phone: string;
    address: string;
    schoolType: string;
  };
  academicYear: {
    year: number;
    terms: Array<{ name: string; startDate: string; endDate: string }>;
  };
  gradingScale: {
    bands: Array<{ label: string; minScore: number; maxScore: number; description: string }>;
  };
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-theme bg-input p-5">
      <h3 className="text-sm font-semibold text-theme-primary">{title}</h3>
      <div className="mt-3 space-y-1 text-sm text-theme-muted">{children}</div>
    </div>
  );
}

export function ReviewStep({ data }: { data: ReviewData }) {
  return (
    <div className="space-y-4">
      <Section title="School profile">
        <p>{data.profile.name || "—"}</p>
        <p>{data.profile.email || "—"}</p>
        <p>{data.profile.phone || "—"}</p>
        <p>{data.profile.address || "—"}</p>
        <p className="capitalize">{data.profile.schoolType || "—"}</p>
      </Section>

      <Section title="Academic year & terms">
        <p>Year: {data.academicYear.year}</p>
        {data.academicYear.terms.map((term, index) => (
          <p key={index}>
            {term.name}: {term.startDate || "—"} → {term.endDate || "—"}
          </p>
        ))}
      </Section>

      <Section title="Grading scale">
        {data.gradingScale.bands.map((band, index) => (
          <p key={index}>
            {band.label}: {band.minScore}–{band.maxScore}
            {band.description ? ` (${band.description})` : ""}
          </p>
        ))}
      </Section>
    </div>
  );
}
