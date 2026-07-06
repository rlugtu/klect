"use client";

import { useState } from "react";
import { createBookmark } from "@/lib/actions/bookmarks";
import { BookmarkForm } from "./BookmarkForm";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelCard } from "@/components/ui/PixelCard";

export function CreateBookmarkPanel({
  listId,
  tagSuggestions,
  listTags,
  tagColors,
}: {
  listId: string;
  tagSuggestions: string[];
  listTags: string[];
  tagColors?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <PixelButton onClick={() => setOpen(true)}>＋ Add bookmark</PixelButton>
    );
  }

  return (
    <PixelCard>
      <div className="mb-4 flex items-center justify-end">
        <button
          type="button"
          aria-label="Close"
          onClick={() => setOpen(false)}
          className="text-muted hover:text-danger cursor-pointer text-2xl leading-none"
        >
          ×
        </button>
      </div>
      <BookmarkForm
        action={async (formData) => {
          await createBookmark(listId, formData);
          // Close the panel on success (list revalidates to show the new card).
          setOpen(false);
        }}
        submitLabel="Create"
        tagSuggestions={tagSuggestions}
        existingTags={listTags}
        tagColors={tagColors}
      />
    </PixelCard>
  );
}
