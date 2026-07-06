"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateBookmark } from "@/lib/actions/bookmarks";
import { BookmarkForm, type BookmarkDefaults } from "./BookmarkForm";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelCard } from "@/components/ui/PixelCard";

/**
 * Bookmark page header: a "back" button (left) that returns to the previous page,
 * and an Edit trigger (top right). The edit form expands full-width below the header.
 */
export function BookmarkHeader({
  listId,
  canEdit,
  bookmarkId,
  defaults,
  tagSuggestions,
  tagColors,
}: {
  listId: string;
  canEdit: boolean;
  bookmarkId: string;
  defaults: BookmarkDefaults;
  tagSuggestions: string[];
  tagColors?: Record<string, string>;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);

  function handleBack() {
    // Return to the exact previous page when navigated in-app; otherwise fall back
    // to the bookmark's list (e.g. opened directly / refreshed / new tab).
    if (window.history.length > 1) router.back();
    else router.push(`/lists/${listId}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <PixelButton variant="ghost" size="sm" onClick={handleBack}>
          ← Back
        </PixelButton>
        {canEdit && (
          <PixelButton
            variant="secondary"
            size="sm"
            onClick={() => setEditOpen((o) => !o)}
          >
            {editOpen ? "Close" : "Edit"}
          </PixelButton>
        )}
      </div>

      {editOpen && canEdit && (
        <PixelCard className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm">Edit bookmark</h2>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setEditOpen(false)}
              className="text-muted hover:text-danger cursor-pointer text-lg leading-none"
            >
              ×
            </button>
          </div>
          <BookmarkForm
            action={async (formData) => {
              await updateBookmark(bookmarkId, formData);
              // Close on success; the detail route revalidates so the hero
              // above shows the updated bookmark info.
              setEditOpen(false);
            }}
            defaults={defaults}
            submitLabel="Save"
            tagSuggestions={tagSuggestions}
            tagColors={tagColors}
          />
        </PixelCard>
      )}
    </div>
  );
}
