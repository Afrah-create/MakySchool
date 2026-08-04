export function AuthMobileBanner({
  headline,
  description,
}: {
  headline: string;
  description?: string;
}) {
  return (
    <div className="auth-brand-panel auth-brand-grid overflow-hidden rounded-2xl px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-auth-brand-muted">
        School workspace
      </p>
      <p className="mt-1.5 text-base font-semibold leading-snug text-auth-brand-primary">
        {headline}
      </p>
      {description ? (
        <p className="mt-1 text-xs leading-relaxed text-auth-brand-faint">{description}</p>
      ) : null}
    </div>
  );
}
