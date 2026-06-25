export function FilterSegment<T extends string>({
  value,
  onChange,
  options,
  "aria-label": ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  "aria-label"?: string;
}) {
  return (
    <div
      className="inline-flex max-w-full flex-wrap rounded-lg border border-theme bg-theme-surface-raised p-0.5"
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const active = value === option.value;

        return (
          <button
            key={option.value || "__all__"}
            type="button"
            onClick={() => onChange(option.value)}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition ${
              active
                ? "bg-theme-surface text-theme-primary shadow-sm"
                : "text-theme-muted hover:text-theme-primary"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
