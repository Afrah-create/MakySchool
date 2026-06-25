export function TablePagination({
  summary,
  onPrevious,
  onNext,
  previousDisabled,
  nextDisabled,
}: {
  summary: string;
  onPrevious: () => void;
  onNext: () => void;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-theme-muted">
      <p>{summary}</p>
      <div className="flex gap-2">
        <button type="button" className="ms-btn-secondary" disabled={previousDisabled} onClick={onPrevious}>
          Previous
        </button>
        <button type="button" className="ms-btn-secondary" disabled={nextDisabled} onClick={onNext}>
          Next
        </button>
      </div>
    </div>
  );
}
