export function AuthMobileBanner({
  headline,
  description,
}: {
  headline: string;
  description: string;
}) {
  return (
    <div className="auth-brand-panel auth-brand-grid overflow-hidden rounded-2xl p-5">
      <p className="text-xs font-medium text-auth-brand-muted">School workspace</p>
      <p className="mt-1 text-lg font-semibold leading-snug text-auth-brand-primary">{headline}</p>
      <p className="mt-2 text-xs leading-relaxed text-auth-brand-faint">{description}</p>
    </div>
  );
}
