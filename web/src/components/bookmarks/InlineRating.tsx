"use client";

import { useState, useTransition } from "react";
import { toast } from "@/lib/toast";
import { setRating } from "@/lib/actions/bookmarks";
import { EditableStars } from "./EditableStars";

/**
 * Clickable 0–5 stars (half steps) that persist immediately from the bookmark
 * detail view. Clicking the current rating again clears it to 0. Optimistic:
 * the stars update on click and revert if the server action fails.
 */
export function InlineRating({
  bookmarkId,
  value: initialValue,
}: {
  bookmarkId: string;
  value: number;
}) {
  const [value, setValue] = useState(initialValue);
  const [isPending, startTransition] = useTransition();

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
    <div className="flex items-center" aria-busy={isPending}>
      <EditableStars value={value} onChange={commit} />
    </div>
  );
}
