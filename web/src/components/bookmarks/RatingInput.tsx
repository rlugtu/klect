"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Clickable 0–5 stars. Clicking the current rating again clears it to 0. */
export function RatingInput({
  name = "rating",
  defaultValue = 0,
}: {
  name?: string;
  defaultValue?: number;
}) {
  const [value, setValue] = useState(defaultValue);
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div className="flex items-center gap-1">
      <input type="hidden" name={name} value={value} />
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          onClick={() => setValue(n === value ? 0 : n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className={cn(
            "cursor-pointer text-2xl leading-none transition-transform hover:scale-110",
            n <= shown ? "text-warning" : "text-muted",
          )}
        >
          {n <= shown ? "★" : "☆"}
        </button>
      ))}
      {value > 0 && (
        <button
          type="button"
          onClick={() => setValue(0)}
          className="text-muted hover:text-danger ml-2 cursor-pointer text-sm"
        >
          clear
        </button>
      )}
    </div>
  );
}
