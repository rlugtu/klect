"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { updateBookmark } from "@/lib/actions/bookmarks";
import { BookmarkForm, type BookmarkDefaults } from "./BookmarkForm";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelCard } from "@/components/ui/PixelCard";

/**
 * Bookmark page header: a "back" button (left) that returns to the previous page,
 * and an Edit trigger (top right). The edit form expands full-width below the header.
 *
 * When `locked`, the Edit trigger is replaced by a visibly disabled "Locked"
 * button instead of disappearing: a collaborator who knows they can normally edit
 * here should see *why* the control is gone, and the page's locked notice right
 * below spells out the rest. The alternative, leaving Edit live, means a filled-in
 * form that throws on Save.
 */
export function BookmarkHeader({
  listId,
  canEdit,
  locked = false,
  bookmarkId,
  defaults,
  tagSuggestions,
  tagColors,
}: {
  listId: string;
  canEdit: boolean;
  /** The bookmark (or its list) is locked — the server refuses edits either way. */
  locked?: boolean;
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
        {canEdit &&
          (locked ? (
            <PixelButton variant="secondary" size="sm" disabled>
              <Lock size={14} aria-hidden /> Locked
            </PixelButton>
          ) : (
            <PixelButton
              variant="secondary"
              size="sm"
              onClick={() => setEditOpen((o) => !o)}
            >
              {editOpen ? "Close" : "Edit"}
            </PixelButton>
          ))}
      </div>

      {editOpen && canEdit && !locked && (
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
