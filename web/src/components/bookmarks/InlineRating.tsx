"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { setRating } from "@/lib/actions/bookmarks";

/**
 * Clickable 0–5 stars that persist immediately from the bookmark detail view.
 * Clicking the current rating again clears it to 0. Optimistic: the stars update
 * on click and revert if the server action fails.
 */
export function InlineRating({
  bookmarkId,
  value: initialValue,
}: {
  bookmarkId: string;
  value: number;
}) {
  const [value, setValue] = useState(initialValue);
  const [hover, setHover] = useState(0);
  const [isPending, startTransition] = useTransition();
  const shown = hover || value;

  const commit = (next: number) => {
    if (next === value) return;
    const prev = value;
    setValue(next); // optimistic
    startTransition(async () => {
      try {
        await setRating(bookmarkId, next);
      } catch {
        setValue(prev); // revert
        toast.error("Could not update rating");
      }
    });
  };

  return (
    <div className="flex items-center gap-1" aria-busy={isPending}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          onClick={() => commit(n === value ? 0 : n)}
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
    </div>
  );
}
