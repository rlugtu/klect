"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Form field for the visited flag, styled as a toggle pill so it reads as a
 * matched pair with `RatingInput` in the bookmark form. Submits via a hidden
 * input whose value is `"on"` when visited (the shape the server action reads).
 */
export function VisitedField({
  name = "visited",
  defaultChecked = false,
}: {
  name?: string;
  defaultChecked?: boolean;
}) {
  const [on, setOn] = useState(defaultChecked);

  return (
    <>
      {on && <input type="hidden" name={name} value="on" />}
      <button
        type="button"
        aria-pressed={on}
        onClick={() => setOn((v) => !v)}
        className={cn(
          "pixel-box-sm cursor-pointer px-3 py-1.5 text-sm transition-colors",
          on ? "bg-success text-primary-ink" : "bg-panel text-muted",
        )}
      >
        {on ? "✔ Visited" : "Mark visited"}
      </button>
    </>
  );
}
