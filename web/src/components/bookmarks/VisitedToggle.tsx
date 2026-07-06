"use client";

import { toggleVisited } from "@/lib/actions/bookmarks";
import { SubmitButton } from "@/components/ui/SubmitButton";

/** Toggles the visited flag from the bookmark detail page. */
export function VisitedToggle({
  bookmarkId,
  visited,
}: {
  bookmarkId: string;
  visited: boolean;
}) {
  return (
    <form action={toggleVisited.bind(null, bookmarkId)}>
      <SubmitButton
        label={visited ? "✔ Visited" : "Mark visited"}
        pendingLabel="…"
        variant={visited ? "secondary" : "primary"}
        size="sm"
      />
    </form>
  );
}
