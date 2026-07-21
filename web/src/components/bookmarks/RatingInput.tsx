"use client";

import { useState } from "react";
import { EditableStars } from "./EditableStars";

/** Clickable 0–5 stars (half steps). Clicking the current rating again clears it to 0. */
export function RatingInput({
  name = "rating",
  defaultValue = 0,
}: {
  name?: string;
  defaultValue?: number;
}) {
  const [value, setValue] = useState(defaultValue);

  return (
    <div className="flex items-center gap-2">
      <input type="hidden" name={name} value={value} />
      <EditableStars value={value} onChange={setValue} />
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
