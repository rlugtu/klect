"use client";

import { useState, type ReactNode } from "react";
import { Lock, Pencil } from "lucide-react";
import type { BookmarkDefaults } from "./BookmarkForm";
import { BookmarkEditCard } from "./BookmarkHeader";
import { PixelButton } from "@/components/ui/PixelButton";

/**
 * The action row of the desktop bookmark views (side panel, and the full page
 * at lg+): caller-supplied actions (Open link, Send, Visited) followed by an
 * Edit toggle, with the edit form opening right below the row.
 *
 * Same lock rule as {@link BookmarkHeader}: a locked bookmark shows a disabled
 * "Locked" button instead of an Edit whose Save the server would refuse.
 */
export function BookmarkDesktopActions({
  children,
  canEdit,
  locked,
  bookmarkId,
  defaults,
  tagSuggestions,
  tagColors,
}: {
  children: ReactNode;
  canEdit: boolean;
  locked: boolean;
  bookmarkId: string;
  defaults: BookmarkDefaults;
  tagSuggestions: string[];
  tagColors?: Record<string, string>;
}) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {children}
        {canEdit &&
          (locked ? (
            <PixelButton variant="secondary" size="sm" disabled>
              <Lock size={14} aria-hidden /> Locked
            </PixelButton>
          ) : (
            <PixelButton
              variant="secondary"
              size="sm"
              aria-expanded={editOpen}
              onClick={() => setEditOpen((o) => !o)}
            >
              <Pencil size={14} aria-hidden />
              {editOpen ? "Close" : "Edit"}
            </PixelButton>
          ))}
      </div>
      {editOpen && canEdit && !locked && (
        <BookmarkEditCard
          bookmarkId={bookmarkId}
          defaults={defaults}
          tagSuggestions={tagSuggestions}
          tagColors={tagColors}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}
