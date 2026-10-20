import { useState } from "react";

/**
 * 0–5 star rating with half steps.
 *
 * A DOM port of web's `EditableStars` + `RatingInput` pair
 * (`web/src/components/bookmarks/`): each star is a muted ☆ with a filled ★ clipped to
 * the fill fraction, and splits into two absolutely-positioned hit targets (left half
 * sets `n - 0.5`, right half sets `n`) with a hover preview. Clicking the value already
 * set clears it back to 0, which is the only way to un-rate without a separate control
 * (and the clear link is there for the mouse that would rather not hunt for the half it
 * last clicked). Same interaction mobile's `RatingStars` uses, so all three clients agree.
 *
 * The glyph is deliberately text, not an icon dependency: the popup ships no icon set
 * (Modern light/dark only, no new design-system dependencies), and ★/☆ render identically
 * across the system font stacks popup.css falls back through.
 *
 * Values are half-step multiples by construction, which is what `bookmarkInput`'s
 * `z.number().min(0).max(5).multipleOf(0.5)` requires, 0 included.
 */
export function RatingInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => {
          // How much of this star is filled: 0, 0.5 or 1.
          const fill = Math.min(1, Math.max(0, shown - (n - 1)));
          const half = n - 0.5;
          return (
            <span key={n} className="relative inline-block text-xl leading-none">
              <span className="text-muted">☆</span>
              <span
                aria-hidden="true"
                className="absolute inset-0 overflow-hidden whitespace-nowrap text-warning"
                style={{ width: `${fill * 100}%` }}
              >
                ★
              </span>
              <button
                type="button"
                aria-label={`${half} stars`}
                disabled={disabled}
                onMouseEnter={() => setHover(half)}
                onClick={() => onChange(half === value ? 0 : half)}
                className="absolute inset-y-0 left-0 z-10 w-1/2 cursor-pointer disabled:cursor-not-allowed"
              />
              <button
                type="button"
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                disabled={disabled}
                onMouseEnter={() => setHover(n)}
                onClick={() => onChange(n === value ? 0 : n)}
                className="absolute inset-y-0 right-0 z-10 w-1/2 cursor-pointer disabled:cursor-not-allowed"
              />
            </span>
          );
        })}
      </div>

      {value > 0 ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(0)}
          className="text-xs text-muted disabled:cursor-not-allowed"
        >
          Clear
        </button>
      ) : (
        <span className="text-xs text-muted">Optional</span>
      )}
    </div>
  );
}
