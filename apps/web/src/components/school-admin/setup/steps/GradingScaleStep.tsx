"use client";

type Band = { label: string; minScore: number; maxScore: number; description: string };
type GradingScaleValue = { bands: Band[] };

export function GradingScaleStep({
  value,
  onChange,
}: {
  value: GradingScaleValue;
  onChange: (next: GradingScaleValue) => void;
}) {
  return (
    <div className="space-y-4">
      {value.bands.map((band, index) => (
        <div
          key={index}
          className="grid gap-3 rounded-xl border border-theme bg-input p-4 md:grid-cols-4"
        >
          <input
            value={band.label}
            onChange={(event) =>
              onChange({
                ...value,
                bands: value.bands.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, label: event.target.value } : item,
                ),
              })
            }
            placeholder="Label"
            className="ms-input"
          />
          <input
            type="number"
            value={band.minScore}
            onChange={(event) =>
              onChange({
                ...value,
                bands: value.bands.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, minScore: Number(event.target.value) } : item,
                ),
              })
            }
            placeholder="Min"
            className="ms-input"
          />
          <input
            type="number"
            value={band.maxScore}
            onChange={(event) =>
              onChange({
                ...value,
                bands: value.bands.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, maxScore: Number(event.target.value) } : item,
                ),
              })
            }
            placeholder="Max"
            className="ms-input"
          />
          <input
            value={band.description}
            onChange={(event) =>
              onChange({
                ...value,
                bands: value.bands.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, description: event.target.value } : item,
                ),
              })
            }
            placeholder="Description (optional)"
            className="ms-input"
          />
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          onChange({
            ...value,
            bands: [...value.bands, { label: "", minScore: 0, maxScore: 0, description: "" }],
          })
        }
        className="ms-btn-ghost"
      >
        Add band
      </button>
    </div>
  );
}
