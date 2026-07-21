"use client";

import { useState } from "react";

/**
 * Interactive 0–5 star row supporting half steps. Each star is split into two
 * hit targets — left half sets `n - 0.5`, right half sets `n` — with a hover
 * preview; clicking the value that's already set clears it to 0. Purely
 * presentational: parents own the committed value + persistence.
 */
export function EditableStars({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div className="flex items-center" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.min(1, Math.max(0, shown - (n - 1)));
        const half = n - 0.5;
        return (
          <span
            key={n}
            className="relative inline-block text-2xl leading-none"
          >
            <span className="text-muted">☆</span>
            <span
              className="text-warning absolute inset-0 overflow-hidden whitespace-nowrap"
              style={{ width: `${fill * 100}%` }}
              aria-hidden
            >
              ★
            </span>
            <button
              type="button"
              aria-label={`${half} stars`}
              onMouseEnter={() => setHover(half)}
              onClick={() => onChange(half === value ? 0 : half)}
              className="absolute inset-y-0 left-0 z-10 w-1/2 cursor-pointer"
            />
            <button
              type="button"
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              onMouseEnter={() => setHover(n)}
              onClick={() => onChange(n === value ? 0 : n)}
              className="absolute inset-y-0 right-0 z-10 w-1/2 cursor-pointer"
            />
          </span>
        );
      })}
    </div>
  );
}
